import { Request, Response, NextFunction } from "express";
import * as service from "./terms.service.js";
import { runTermMaintenance } from "./term-notifications.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";
import type { LeaveListQuery, PassScanQuery, TermRosterQuery } from "./terms.schema.js";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Bọc handler async: lỗi ⇒ `next(err)` (errorHandler trả JSON thống nhất). */
const wrap =
  (fn: (req: Request, res: Response) => Promise<void>): Handler =>
  async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };

const id = (req: Request) => req.params.id as string;

export const listTerms = wrap(async (_req, res) => {
  sendSuccess(res, await service.listTerms(), "Terms retrieved successfully");
});

export const getCurrentTerm = wrap(async (_req, res) => {
  sendSuccess(res, await service.getCurrentTerm(), "Current term retrieved successfully");
});

export const updateTerm = wrap(async (req, res) => {
  sendSuccess(res, await service.updateTerm(id(req), req.body), "Term updated successfully");
});

export const getTermRoster = wrap(async (req, res) => {
  sendSuccess(res, await service.getTermRoster(id(req), req.query as unknown as TermRosterQuery), "Term roster retrieved successfully");
});

export const evaluateTerm = wrap(async (req, res) => {
  sendSuccess(res, await service.evaluateTerm(id(req)), "Term evaluated successfully");
});

export const exemptCoach = wrap(async (req, res) => {
  const evaluation = await service.exemptCoach(id(req), req.params.coachId as string, req.user!.id, req.body.reason);
  sendSuccess(res, { evaluation }, "Coach exempted successfully");
});

export const unexemptCoach = wrap(async (req, res) => {
  const evaluation = await service.unexemptCoach(id(req), req.params.coachId as string);
  sendSuccess(res, { evaluation }, "Coach exemption removed successfully");
});

export const runMaintenance = wrap(async (_req, res) => {
  sendSuccess(res, await runTermMaintenance(), "Term maintenance completed");
});

// ── Coach ──
export const getMyTermStatus = wrap(async (req, res) => {
  sendSuccess(res, await service.getMyTermStatus(req.user!.id), "My term status retrieved successfully");
});

export const listMyLeaves = wrap(async (req, res) => {
  sendSuccess(res, await service.listMyLeaves(req.user!.id), "My leaves retrieved successfully");
});

export const createLeave = wrap(async (req, res) => {
  sendCreated(res, await service.createLeave(req.user!.id, req.body), "Leave request submitted");
});

export const cancelMyLeave = wrap(async (req, res) => {
  sendSuccess(res, await service.cancelMyLeave(req.user!.id, id(req)), "Leave request cancelled");
});

export const getMyPass = wrap(async (req, res) => {
  sendSuccess(res, await service.issueCoachPass(req.user!.id), "Coach pass issued");
});

// ── Manager: nghỉ phép + thẻ ──
export const listLeaves = wrap(async (req, res) => {
  const { leaves, pagination } = await service.listLeaves(req.query as unknown as LeaveListQuery);
  sendSuccess(res, leaves, "Leaves retrieved successfully", 200, pagination);
});

export const reviewLeave = wrap(async (req, res) => {
  sendSuccess(res, await service.reviewLeave(id(req), req.user!.id, req.body), "Leave reviewed successfully");
});

export const verifyPass = wrap(async (req, res) => {
  sendSuccess(res, await service.verifyCoachPass(req.body.token, req.user!.id), "Coach pass verified");
});

export const listPassScans = wrap(async (req, res) => {
  const { scans, pagination } = await service.listPassScans(req.query as unknown as PassScanQuery);
  sendSuccess(res, scans, "Pass scans retrieved successfully", 200, pagination);
});
