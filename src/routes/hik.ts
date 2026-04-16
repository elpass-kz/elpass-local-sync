import { Router } from "express";
import { HikController } from "../controllers/HikController";
import { ServiceContainer } from "../services/ServiceContainer";

const router = Router();

const services = ServiceContainer.getInstance();

const controller = new HikController(
  services.hikCardService,
  services.cardSyncService,
);

router.post("/cards", (req, res, next) => controller.getCards(req, res, next));
router.delete("/cards", (req, res, next) =>
  controller.batchDeleteCards(req, res, next),
);

export default router;
