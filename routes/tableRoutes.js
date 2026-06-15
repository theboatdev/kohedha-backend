import express from "express";
import {
  getTables,
  getTableById,
  createTable,
  updateTable,
  deleteTable,
  updateTablePositions,
} from "../controller/tableController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

// Main CRUD routes
router.get("/", getTables);
router.get("/:id", getTableById);
router.post("/new-table", createTable);
router.put("/update-table/:id", updateTable);
router.delete("/delete-table/:id", deleteTable);
router.put("/update-positions", updateTablePositions);

export default router;
