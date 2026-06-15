import csv from "csv-parser";
import { Readable } from "stream";

export const parseCSV = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const errors = [];
    let rowNumber = 0;

    const stream = Readable.from(buffer.toString());

    stream
      .pipe(
        csv({
          skipLines: 0,
          mapHeaders: ({ header }) => header.toLowerCase().trim(), // Normalize headers
          trim: true, // Automatically trim values
        }),
      )
      .on("data", (data) => {
        rowNumber++;
        results.push({ ...data, _rowNumber: rowNumber });
      })
      .on("error", (error) => {
        errors.push({ error: error.message });
      })
      .on("end", () => {
        if (errors.length > 0) {
          reject(errors);
        } else {
          resolve(results);
        }
      });
  });
};
