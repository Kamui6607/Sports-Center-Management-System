import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { sendError } from "../utils/response.js";

type Target = "body" | "query" | "params";

// Augment Express Request to store validated data
declare global {
  namespace Express {
    interface Request {
      validated?: Record<string, unknown>;
    }
  }
}

export function validate(schema: ZodSchema, target: Target = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      sendError(res, "Validation failed", 400, errors);
      return;
    }
    // For body/params, we can safely write back (they are plain objects).
    // In Express v5 req.query is exposed through a getter, so redefine it on
    // the request instance. This makes the validated (and unknown-key-stripped)
    // data visible to controllers/services that read req.query.
    if (target === "body" || target === "params") {
      (req as any)[target] = result.data;
    } else if (target === "query") {
      Object.defineProperty(req, "query", {
        value: result.data,
        configurable: true,
      });
    }
    // Always store on req.validated for services to use if needed
    req.validated = result.data as Record<string, unknown>;
    next();
  };
}
