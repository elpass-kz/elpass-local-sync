import { Router } from "express";
import { DahuaController } from "../controllers/DahuaController";
import { ServiceContainer } from "../services/ServiceContainer";

const router = Router();

const services = ServiceContainer.getInstance();

const controller = new DahuaController(
  services.dahuaCardService,
  services.cardSyncService,
);

router.delete("/cards", (req, res, next) =>
  controller.batchDeleteCards(req, res, next),
);

export default router;
