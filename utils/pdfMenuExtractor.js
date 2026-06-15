import dotenv from "dotenv";
dotenv.config();

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Convert pdf buffer to images
export const pdfToImages = async (pdfBuffer) => {
  try {
    // Parse pdf to get info
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();

    const pageCount = result.numpages || 1;
    const textContent = result.text;

    // Image conversion should implement here

    return {
      pageCount,
      textContent,
    };
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
};

// Extract menu items from pdf
export const extractMenuFromPDF = async (pdfBuffer, menuSchema = null) => {
  try {
    const { textContent, pageCount } = await pdfToImages(pdfBuffer);

    if (!textContent || textContent.trim().length === 0) {
      throw new Error(
        "PDF appears to be empty or contains only images. OCR processing required.",
      );
    }

    // Initialize Gemini model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Structured prompt for menu extraction
    const prompt = `You are a menu data extraction expert. Extract ALL menu items from the following restaurant menu text.

        MENU TEXT:
        ${textContent}

        INSTRUCTIONS:
        1. Extract every menu item you can find
        2. Identify the category for each item (e.g., Appetizers, Main Courses, Desserts, Beverages, etc.)
        3. Extract item name, description, price, and currency
        4. If no description is provided, leave it empty
        5. If multiple prices exist (e.g., different sizes), create separate entries
        6. Normalize currency codes (e.g., Rs, රු -> LKR, $ -> USD)
        7. Convert prices to numbers (remove currency symbols and commas)

        REQUIRED OUTPUT FORMAT (JSON array):
        [
        {
            "category": "string (e.g., Appetizers, Main Course)",
            "name": "string (item name)",
            "description": "string (optional, can be empty)",
            "price": number (numeric value only),
            "currency": "string (ISO code: LKR, USD, EUR, etc.)"
        }
        ]

        IMPORTANT:
        - Return ONLY valid JSON array, no additional text
        - Ensure all prices are positive numbers
        - Use "LKR" as default currency if not specified
        - Group items by category logically
        - If you cannot extract data, return an empty array []

        Extract the menu items now:`;

    // Call API
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response
    let extractedItems;
    try {
      // Clean response
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      extractedItems = JSON.parse(cleanedText);
    } catch (parseError) {
      throw new Error(
        `Failed to parse Gemini response as JSON: ${parseError.message}`,
      );
    }

    // Validate extracted data
    if (!Array.isArray(extractedItems)) {
      throw new Error("Gemini did not return an array of items");
    }

    // Sanitize and validate each item
    const validatedItems = extractedItems.map((item, index) => {
      // Basic validation
      if (!item.name || !item.category) {
        throw new Error(
          `Item at index ${index} missing required fields (name or category)`,
        );
      }

      return {
        category: String(item.category || "Uncategorized").trim(),
        name: String(item.name).trim(),
        description: String(item.description || "").trim(),
        price: parseFloat(item.price) || 0,
        currency: String(item.currency || "LKR")
          .toUpperCase()
          .trim(),
      };
    });

    return {
      success: true,
      totalItems: validatedItems.length,
      pages: pageCount,
      items: validatedItems,
    };
  } catch (error) {
    throw new Error(`Menu extraction failde: ${error.message}`);
  }
};
