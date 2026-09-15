import { Request, Response, NextFunction } from "express";
import * as invoicesService from "./invoices.service.js";
import { sendSuccess } from "../../utils/response.js";

export async function listInvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const { invoices, pagination } = await invoicesService.listInvoices(req.query);
    sendSuccess(res, invoices, "Invoices retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}
export async function getInvoiceById(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await invoicesService.getInvoiceById(req.params.id as string);
    sendSuccess(res, invoice, "Invoice retrieved successfully");
  } catch (err) { next(err); }
}
export async function getMemberInvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const { invoices, pagination } = await invoicesService.getMemberInvoices(
      req.params.memberId as string,
      req.query
    );
    sendSuccess(res, invoices, "Member invoices retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}
