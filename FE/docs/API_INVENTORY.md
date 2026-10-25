# OpenAPI endpoint inventory

Source: docs/openapi.json — exported from the checked-out backend with `cd BE && npm run openapi:export` (`--live` downloads https://sports-center-management-system.onrender.com/api/v1/docs/swagger-ui-init.js instead; do not use it for an unreleased local backend).

Snapshot: 2026-10-24. Production base: https://sports-center-management-system.onrender.com/api/v1

Response examples are documentation only, never application data. The client sends the documented HTTP Bearer token.

## GET /users
List all users

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "role",
    "schema": {
      "type": "string",
      "enum": [
        "MEMBER",
        "COACH",
        "MANAGER"
      ]
    }
  },
  {
    "in": "query",
    "name": "isActive",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false"
      ]
    }
  },
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated list of users (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Users retrieved successfully",
            "data": [
              {
                "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
                "email": "manager@sportscenter.com",
                "fullName": "Jane Doe",
                "phone": "0900000002",
                "gender": "FEMALE",
                "dateOfBirth": null,
                "avatarUrl": null,
                "role": "MEMBER",
                "isActive": true,
                "createdAt": "2026-09-11T14:20:14.910Z",
                "memberProfile": null,
                "coachProfile": null,
                "managerProfile": null
              }
            ],
            "pagination": {
              "page": 1,
              "limit": 10,
              "total": 8,
              "totalPages": 1
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /users
Create coach, manager or member account (MEMBER creates the member profile too)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "email",
    "password",
    "fullName",
    "role"
  ],
  "properties": {
    "email": {
      "type": "string",
      "format": "email"
    },
    "password": {
      "type": "string",
      "minLength": 6
    },
    "fullName": {
      "type": "string",
      "minLength": 2
    },
    "phone": {
      "type": "string"
    },
    "gender": {
      "type": "string",
      "enum": [
        "MALE",
        "FEMALE",
        "OTHER"
      ]
    },
    "dateOfBirth": {
      "type": "string",
      "format": "date"
    },
    "role": {
      "type": "string",
      "enum": [
        "MEMBER",
        "COACH"
      ],
      "description": "Không tạo được tài khoản MANAGER"
    },
    "fitnessGoal": {
      "type": "string",
      "description": "Role MEMBER only"
    },
    "trainingLevel": {
      "type": "string",
      "enum": [
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED"
      ],
      "description": "Role MEMBER only"
    },
    "trainingPreference": {
      "type": "string",
      "description": "Role MEMBER only"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "User created (member/coach/manager gets its profile)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "User created successfully",
            "data": {
              "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
              "email": "member1@example.com",
              "fullName": "John Doe",
              "phone": "0900000005",
              "gender": "MALE",
              "dateOfBirth": null,
              "role": "MEMBER",
              "isActive": true,
              "createdAt": "2026-09-11T14:20:14.910Z",
              "memberProfile": {
                "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                "trainingLevel": "BEGINNER"
              },
              "coachProfile": null,
              "managerProfile": null
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /users/{id}
Get user by ID

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single user",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "User retrieved successfully",
            "data": {
              "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
              "email": "member1@example.com",
              "fullName": "John Doe",
              "phone": "0900000005",
              "gender": "MALE",
              "dateOfBirth": null,
              "avatarUrl": null,
              "role": "MEMBER",
              "isActive": true,
              "memberProfile": {
                "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4"
              },
              "coachProfile": null,
              "managerProfile": null
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /users/{id}
Update user (thông tin / vai trò / mở khóa)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "fullName": {
      "type": "string"
    },
    "phone": {
      "type": "string"
    },
    "gender": {
      "type": "string",
      "enum": [
        "MALE",
        "FEMALE",
        "OTHER"
      ]
    },
    "dateOfBirth": {
      "type": "string"
    },
    "isActive": {
      "type": "boolean"
    },
    "role": {
      "type": "string",
      "enum": [
        "MEMBER",
        "COACH",
        "MANAGER"
      ]
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single user",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "User retrieved successfully",
            "data": {
              "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
              "email": "member1@example.com",
              "fullName": "John Doe",
              "phone": "0900000005",
              "gender": "MALE",
              "dateOfBirth": null,
              "avatarUrl": null,
              "role": "MEMBER",
              "isActive": true,
              "memberProfile": {
                "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4"
              },
              "coachProfile": null,
              "managerProfile": null
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## DELETE /users/{id}
Khóa tài khoản (khóa mềm isActive=false — KHÔNG xóa dữ liệu, không hủy lớp/hoàn tiền/đơn)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single user",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "User retrieved successfully",
            "data": {
              "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
              "email": "member1@example.com",
              "fullName": "John Doe",
              "phone": "0900000005",
              "gender": "MALE",
              "dateOfBirth": null,
              "avatarUrl": null,
              "role": "MEMBER",
              "isActive": true,
              "memberProfile": {
                "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4"
              },
              "coachProfile": null,
              "managerProfile": null
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /users/{id}/password-reset
Manager gửi yêu cầu đặt lại mật khẩu (email chứa mã OTP để người dùng TỰ đặt mật khẩu mới)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "202": {
    "description": "Email đã vào hàng đợi (outbox)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Đã đưa email đặt lại mật khẩu vào hàng đợi gửi.",
            "data": {
              "queued": true,
              "channel": "EMAIL",
              "recipient": "me***@example.com",
              "outboxId": "uuid",
              "expiresAt": "2026-10-17T10:15:00.000Z",
              "expiresInSeconds": 900,
              "resendAfterSeconds": 60
            }
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "USER_LOCKED — tài khoản đang khóa"
  },
  "429": {
    "description": "RESET_COOLDOWN (kèm retryAfterSeconds) hoặc RATE_LIMITED"
  }
}
```

## GET /users/{id}/password-reset
Trạng thái yêu cầu đặt lại mật khẩu gần nhất (mã còn hạn/đã dùng, email đã gửi chưa) — không lộ mã

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "OK",
            "data": {
              "request": {
                "requestedAt": "2026-10-17T10:00:00.000Z",
                "expiresAt": "2026-10-17T10:15:00.000Z",
                "usedAt": null,
                "state": "ACTIVE"
              },
              "email": {
                "id": "uuid",
                "initiatedBy": "MANAGER",
                "status": "PENDING",
                "attempts": 0,
                "queuedAt": "2026-10-17T10:00:00.000Z",
                "sentAt": null
              }
            }
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /users/{id}/history
Thống kê dữ liệu nghiệp vụ của tài khoản (quyết định xóa vĩnh viễn được hay chỉ khóa)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "OK",
            "data": {
              "canDeletePermanently": false,
              "history": {
                "enrollments": 3,
                "payments": 1
              }
            }
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## DELETE /users/{id}/permanent
XÓA VĨNH VIỄN tài khoản chưa phát sinh dữ liệu nghiệp vụ (tài khoản có lịch sử ⇒ 409, hãy khóa)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ id, email, fullName, deleted: true }"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "USER_HAS_HISTORY (kèm history) / LAST_ACTIVE_MANAGER"
  }
}
```

## GET /training-plans
undefined

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "memberId",
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Success"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## POST /training-plans
undefined

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "memberId": {
      "type": "string"
    },
    "coachId": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "startDate": {
      "type": "string"
    },
    "endDate": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Success"
  }
}
```

## PATCH /training-plans/{id}
Change the coach of a training plan (Member changes own plan, Coach current plan, Manager any plan)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string",
      "format": "uuid"
    },
    "description": "TrainingPlan ID"
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "coachId"
  ],
  "properties": {
    "coachId": {
      "type": "string",
      "format": "uuid",
      "description": "CoachProfile.id của HLV mới (khác HLV hiện tại)"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Training plan coach updated successfully",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true,
          "message": "Training plan coach updated successfully",
          "data": {
            "id": "b7e3d6f0-0000-4000-8000-000000000001",
            "memberId": "member-1",
            "coachId": "c1a2b3c4-0000-4000-8000-000000000002",
            "name": "Giảm cân 8 tuần",
            "coach": {
              "user": {
                "fullName": "Coach Two"
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /training-plans/{id}
BE-17: Một lộ trình kèm kết quả (MEMBER chủ plan / COACH phụ trách / MANAGER)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "TrainingPlan + coach.user + member.user + results[]"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## POST /training-plans/results
Coach ghi một mốc tiến độ cho kế hoạch (CHỈ Coach phụ trách plan)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "planId",
    "date"
  ],
  "properties": {
    "planId": {
      "type": "string",
      "format": "uuid"
    },
    "date": {
      "type": "string",
      "format": "date-time"
    },
    "coachNote": {
      "type": "string",
      "maxLength": 1000
    },
    "metrics": {
      "type": "array",
      "maxItems": 30,
      "items": {
        "type": "object",
        "required": [
          "name",
          "value"
        ],
        "properties": {
          "name": {
            "type": "string",
            "example": "Squat"
          },
          "value": {
            "type": "number",
            "example": 80
          },
          "unit": {
            "type": "string",
            "example": "kg"
          },
          "lowerIsBetter": {
            "type": "boolean",
            "description": "true nếu số càng nhỏ càng tốt (vd. thời gian chạy)"
          }
        }
      }
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Success"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## PATCH /training-plans/results/{id}
Coach sửa một mốc tiến độ (CHỈ Coach phụ trách plan)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "description": "Cần ít nhất một trường. `metrics` nếu gửi sẽ thay toàn bộ danh sách chỉ số của mốc.",
  "properties": {
    "date": {
      "type": "string",
      "format": "date-time"
    },
    "coachNote": {
      "type": "string",
      "maxLength": 1000
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Updated"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## DELETE /training-plans/results/{id}
Coach xóa một mốc tiến độ (CHỈ Coach phụ trách plan)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Deleted"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## POST /training-plans/{id}/attachments
Coach attaches a PDF/Excel file to a training plan

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "201": {
    "description": "Uploaded"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /training-plans/{id}/attachments
List attachments of a training plan (plan's Coach, plan's Member, Manager)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /training-plans/{id}/attachments/{attachmentId}
Download an attachment (authenticated)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "path",
    "name": "attachmentId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "File"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## DELETE /training-plans/{id}/attachments/{attachmentId}
Delete an attachment (plan's Coach only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "path",
    "name": "attachmentId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Deleted"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /training-plans/{id}/progress
Xem tiến độ của một kế hoạch (Member chủ plan, Coach phụ trách, Manager)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Success"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /terms
Danh sách kỳ học (năm trước, năm nay, năm sau)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "[{ id, name, year, seq, startDate, endDate, graceDays, graceDeadline, phase, daysToStart, daysToEnd }]"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /terms/current
Kỳ học hiện tại

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Kỳ chứa thời điểm hiện tại (giờ Việt Nam)"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /terms/me
COACH — trạng thái của tôi trong kỳ hiện tại

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /terms/me/pass
COACH — mã thẻ ra vào (JWT sống ~60 giây, app tự làm mới)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /terms/me/leaves
COACH — đơn nghỉ phép của tôi

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## POST /terms/me/leaves
COACH — xin nghỉ phép/ốm

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "startDate",
    "endDate",
    "reason"
  ],
  "properties": {
    "startDate": {
      "type": "string",
      "example": "2026-11-02",
      "description": "YYYY-MM-DD (giờ VN)"
    },
    "endDate": {
      "type": "string",
      "example": "2026-11-09"
    },
    "kind": {
      "type": "string",
      "enum": [
        "SICK",
        "PERSONAL",
        "OTHER"
      ]
    },
    "reason": {
      "type": "string",
      "minLength": 3,
      "maxLength": 500
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Created"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "409": {
    "description": "LEAVE_OVERLAP — trùng đơn nghỉ khác"
  }
}
```

## DELETE /terms/me/leaves/{id}
COACH — hủy đơn nghỉ (đang chờ duyệt, hoặc đã duyệt nhưng chưa bắt đầu)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "LEAVE_NOT_CANCELLABLE"
  }
}
```

## GET /terms/leaves
MANAGER — danh sách đơn nghỉ phép của Coach

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "CANCELLED"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## PATCH /terms/leaves/{id}/review
MANAGER — duyệt / từ chối đơn nghỉ phép

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "action"
  ],
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "APPROVE",
        "REJECT"
      ]
    },
    "note": {
      "type": "string",
      "maxLength": 300
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "LEAVE_ALREADY_REVIEWED"
  }
}
```

## POST /terms/pass/verify
MANAGER — quét thẻ ra vào của Coach ⇒ hợp lệ hay không (ghi nhật ký)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "token"
  ],
  "properties": {
    "token": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "400": {
    "description": "PASS_EXPIRED | PASS_INVALID"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /terms/pass/scans
MANAGER — nhật ký quét thẻ Coach

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "valid",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## POST /terms/maintenance
MANAGER — chạy ngay job nhắc & đánh giá kỳ (cũng chạy định kỳ ở server)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## POST /terms/check-in/qr
MANAGER — tạo mã QR check-in phòng gym cho HLV (sống ~60 giây, trang Web tự đổi mã)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ token, expiresIn, issuedAt } — token đưa vào QR"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## POST /terms/check-in
COACH — quét QR check-in ⇒ ghi MỘT ngày dùng phòng (giờ VN)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "token"
  ],
  "properties": {
    "token": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đã check-in hôm nay"
  },
  "201": {
    "description": "Created — ngày dùng đầu tiên trong ngày"
  },
  "400": {
    "description": "CHECKIN_QR_EXPIRED | CHECKIN_QR_INVALID"
  },
  "403": {
    "description": "CHECKIN_NOT_ELIGIBLE — hồ sơ chưa duyệt / tài khoản khóa"
  }
}
```

## GET /terms/me/check-ins
COACH — mức dùng phòng tháng này + các ngày gần đây

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /terms/check-ins
MANAGER — nhật ký check-in phòng gym của HLV (+ tổng hợp phí)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "dayKey",
    "schema": {
      "type": "string",
      "example": "2026-10-24"
    }
  },
  {
    "in": "query",
    "name": "monthKey",
    "schema": {
      "type": "string",
      "example": "2026-10"
    }
  },
  {
    "in": "query",
    "name": "coachId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ items, summary: { total, free, paid, feeAssessed, feeCharged, feeDebt } } + pagination"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## PATCH /terms/{id}
MANAGER — chỉnh số ngày ân hạn của kỳ (0–60)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "graceDays"
  ],
  "properties": {
    "graceDays": {
      "type": "integer",
      "minimum": 0,
      "maximum": 60
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Kỳ đã kết thúc"
  }
}
```

## GET /terms/{id}/coaches
MANAGER — bảng Coach × kỳ (đạt / chưa đạt / chờ / miễn) kèm số liệu

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "state",
    "schema": {
      "type": "string",
      "enum": [
        "PENDING",
        "COMPLIANT",
        "NON_COMPLIANT",
        "EXEMPT"
      ]
    }
  },
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## POST /terms/{id}/evaluate
MANAGER — đánh giá và LƯU kết quả cả kỳ (idempotent)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ term, summary, evaluatedAt }"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## PUT /terms/{id}/coaches/{coachId}/exempt
MANAGER — miễn trừ một Coach trong kỳ (kèm lý do)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "path",
    "name": "coachId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "reason"
  ],
  "properties": {
    "reason": {
      "type": "string",
      "minLength": 3,
      "maxLength": 300
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## DELETE /terms/{id}/coaches/{coachId}/exempt
MANAGER — bỏ miễn trừ

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "path",
    "name": "coachId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /shop/config
Cấu hình cửa hàng (giữ hàng, phí ship, khu vực giao, giới hạn…)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ holdMinutes, maxPendingOrders, pickupDays, shippingFee, freeShippingThreshold, deliveryProvinces[], … }"
  }
}
```

## GET /shop/cart
Giỏ hàng + cảnh báo từng dòng

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ id, items[], count, totalQuantity, subtotal, hasWarnings }"
  }
}
```

## DELETE /shop/cart
Xóa toàn bộ giỏ

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Giỏ rỗng"
  }
}
```

## POST /shop/cart/items
Thêm sản phẩm vào giỏ (cộng dồn). Giỏ không giữ tồn kho.

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "productId"
  ],
  "properties": {
    "productId": {
      "type": "string"
    },
    "quantity": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Giỏ sau khi thêm"
  },
  "400": {
    "description": "PRODUCT_INACTIVE / MAX_PER_ORDER_EXCEEDED / CART_FULL"
  },
  "409": {
    "description": "OUT_OF_STOCK / INSUFFICIENT_STOCK"
  },
  "429": {
    "description": "RATE_LIMITED"
  }
}
```

## PATCH /shop/cart/items/{productId}
Đặt lại số lượng một dòng

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "productId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "quantity"
  ],
  "properties": {
    "quantity": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Giỏ sau khi sửa"
  }
}
```

## DELETE /shop/cart/items/{productId}
Xóa một dòng

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "productId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Giỏ sau khi xóa"
  }
}
```

## POST /shop/cart/accept-prices
Chấp nhận giá hiện tại cho mọi dòng (xóa cảnh báo PRICE_CHANGED)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Giỏ đã cập nhật giá"
  }
}
```

## GET /shop/addresses
Sổ địa chỉ (mặc định lên đầu; `deliverable` = trong khu vực giao)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "[{ id, recipientName, phone, province, district, ward, street, isDefault, fullAddress, deliverable }]"
  }
}
```

## POST /shop/addresses
Thêm địa chỉ (địa chỉ đầu tiên tự là mặc định; tối đa 10)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "recipientName",
    "phone",
    "province",
    "street"
  ],
  "properties": {
    "recipientName": {
      "type": "string"
    },
    "phone": {
      "type": "string",
      "example": "0901234567"
    },
    "province": {
      "type": "string",
      "example": "Hồ Chí Minh"
    },
    "district": {
      "type": "string",
      "description": "Không bắt buộc (địa giới 2 cấp)"
    },
    "ward": {
      "type": "string"
    },
    "street": {
      "type": "string"
    },
    "isDefault": {
      "type": "boolean"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Địa chỉ mới"
  }
}
```

## PATCH /shop/addresses/{id}
Sửa địa chỉ của mình (không phải của mình ⇒ 404)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Địa chỉ sau khi sửa"
  }
}
```

## DELETE /shop/addresses/{id}
Xóa địa chỉ (xóa mặc định ⇒ địa chỉ cũ nhất còn lại thành mặc định)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Sổ địa chỉ còn lại"
  }
}
```

## POST /shop/addresses/{id}/default
Đặt làm địa chỉ mặc định

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Sổ địa chỉ"
  }
}
```

## POST /shop/checkout/preview
Xem trước đơn (không ghi) — dòng, tạm tính, phí ship, tổng, cảnh báo, canCheckout

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "mode",
    "fulfillmentType"
  ],
  "properties": {
    "mode": {
      "type": "string",
      "enum": [
        "CART",
        "BUY_NOW"
      ]
    },
    "productIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "CART: chọn dòng (trống = cả giỏ)"
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "productId": {
            "type": "string"
          },
          "quantity": {
            "type": "integer"
          }
        }
      },
      "description": "BUY_NOW"
    },
    "fulfillmentType": {
      "type": "string",
      "enum": [
        "PICKUP",
        "DELIVERY"
      ]
    },
    "addressId": {
      "type": "string",
      "description": "DELIVERY: địa chỉ trong sổ của chính mình"
    },
    "recipientName": {
      "type": "string"
    },
    "recipientPhone": {
      "type": "string"
    },
    "note": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ lines[], subtotal, shippingFee, total, recipient, address, warnings[], canCheckout, pendingOrders, lockedUntil }"
  }
}
```

## POST /shop/checkout
Tạo đơn + giao dịch VietQR (SePay) hoặc đơn trả tại quầy (CASH) — bắt buộc header Idempotency-Key

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "header",
    "name": "Idempotency-Key",
    "required": true,
    "schema": {
      "type": "string",
      "minLength": 8
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "mode",
    "fulfillmentType",
    "expectedTotal"
  ],
  "properties": {
    "mode": {
      "type": "string",
      "enum": [
        "CART",
        "BUY_NOW"
      ]
    },
    "productIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "productId": {
            "type": "string"
          },
          "quantity": {
            "type": "integer"
          }
        }
      }
    },
    "fulfillmentType": {
      "type": "string",
      "enum": [
        "PICKUP",
        "DELIVERY"
      ]
    },
    "paymentMethod": {
      "type": "string",
      "enum": [
        "SEPAY",
        "CASH"
      ],
      "default": "SEPAY"
    },
    "pickupDate": {
      "type": "string",
      "format": "date"
    },
    "addressId": {
      "type": "string"
    },
    "recipientName": {
      "type": "string"
    },
    "recipientPhone": {
      "type": "string"
    },
    "note": {
      "type": "string"
    },
    "expectedTotal": {
      "type": "integer"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Idempotent replay (đơn đã tạo với cùng khóa)"
  },
  "201": {
    "description": "{ order, checkout: { paymentId, orderCode, amount, qrUrl, expiresAt, bank, order{ id, code } } }"
  },
  "400": {
    "description": "CART_EMPTY / ADDRESS_REQUIRED / DELIVERY_NOT_AVAILABLE / MAX_PER_ORDER_EXCEEDED / DAILY_LIMIT_EXCEEDED / PRODUCT_INACTIVE / IDEMPOTENCY_KEY_REQUIRED / PICKUP_DATE_OUT_OF_RANGE / CASH_ORDER_TOO_LARGE"
  },
  "403": {
    "description": "CHECKOUT_LOCKED (kèm lockedUntil) / CASH_PAYMENT_LOCKED"
  },
  "409": {
    "description": "OUT_OF_STOCK / INSUFFICIENT_STOCK / PRICE_CHANGED / PENDING_ORDER_LIMIT / CASH_ORDER_LIMIT / IDEMPOTENCY_KEY_REUSED"
  },
  "429": {
    "description": "RATE_LIMITED"
  },
  "503": {
    "description": "SEPAY_NOT_CONFIGURED"
  }
}
```

## GET /shop/orders
Đơn của tôi (lọc nhóm PENDING|ACTIVE|COMPLETED|CLOSED hoặc trạng thái cụ thể)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "data[] + counts{ PENDING, ACTIVE, COMPLETED, CLOSED } + pagination"
  }
}
```

## GET /shop/orders/{id}
Chi tiết đơn của tôi — items (+ quyền đánh giá), history, payment, pickup{code,qrPayload,deadline} khi READY, actions

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Chi tiết đơn"
  },
  "404": {
    "description": "Không có hoặc không phải đơn của mình (chặn IDOR)"
  }
}
```

## POST /shop/orders/{id}/cancel
Hủy đơn chờ thanh toán (nhả hàng). Đơn đã thanh toán ⇒ 409 ORDER_PAID_USE_REFUND.

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đơn đã hủy"
  }
}
```

## POST /shop/orders/{id}/request-refund
Đơn ĐÃ THANH TOÁN (PAID) ⇒ REFUND_REQUESTED + yêu cầu hoàn tiền (Manager duyệt)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "reason"
  ],
  "properties": {
    "reason": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đơn chờ hoàn tiền"
  },
  "409": {
    "description": "ORDER_NOT_REFUNDABLE / REFUND_ALREADY_REQUESTED"
  }
}
```

## POST /shop/orders/{id}/confirm-received
Khách xác nhận đã nhận hàng (DELIVERED ⇒ COMPLETED)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đơn hoàn tất"
  }
}
```

## POST /shop/orders/{id}/reschedule-pickup
Đổi ngày nhận / gia hạn tại quầy (tối đa SHOP_PICKUP_MAX_RESCHEDULES lần, dời ≤ SHOP_PICKUP_RESCHEDULE_MAX_DAYS ngày) — đơn đã sẵn sàng thì tính lại hạn nhận

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "pickupDate"
  ],
  "properties": {
    "pickupDate": {
      "type": "string",
      "format": "date"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Chi tiết đơn sau khi đổi"
  },
  "400": {
    "description": "PICKUP_DATE_OUT_OF_RANGE / PICKUP_DATE_INVALID"
  },
  "409": {
    "description": "PICKUP_NOT_RESCHEDULABLE / PICKUP_RESCHEDULE_LIMIT / PICKUP_DEADLINE_PASSED / ORDER_STATE_CHANGED"
  }
}
```

## PUT /shop/orders/{id}/refund-bank
Khách bổ sung / sửa số tài khoản nhận tiền hoàn của yêu cầu hoàn đang chờ

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "bankName",
    "bankAccountNumber",
    "bankAccountName"
  ],
  "properties": {
    "bankName": {
      "type": "string"
    },
    "bankAccountNumber": {
      "type": "string"
    },
    "bankAccountName": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Chi tiết đơn"
  },
  "409": {
    "description": "REFUND_NOT_PENDING"
  }
}
```

## POST /shop/order-items/{id}/review
Đánh giá một dòng đơn COMPLETED của mình (mỗi dòng tối đa 1 đánh giá)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "rating"
  ],
  "properties": {
    "rating": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5
    },
    "comment": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Đánh giá"
  },
  "403": {
    "description": "REVIEW_NOT_ALLOWED"
  },
  "409": {
    "description": "REVIEW_EXISTS"
  }
}
```

## GET /shop/manage/summary
Đếm đơn theo trạng thái + số sản phẩm sắp hết

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ byStatus, needsAction, toPrepare, readyForPickup, shipping, refundRequested, lowStockProducts }"
  }
}
```

## GET /shop/manage/orders
Danh sách đơn (lọc trạng thái/nhóm, hình thức nhận, tìm mã đơn/tên/SĐT/vận đơn)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "fulfillmentType",
    "schema": {
      "type": "string",
      "enum": [
        "PICKUP",
        "DELIVERY"
      ]
    }
  },
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "queue",
    "schema": {
      "type": "string",
      "enum": [
        "PICKUP_TODAY",
        "REFUND_PENDING",
        "STALE_REFUND"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Danh sách đơn (kèm pendingRefund{ awaitingBankInfo, isStale })"
  }
}
```

## GET /shop/manage/orders/{id}
Chi tiết đơn cho Manager (người mua, allowedTransitions; không lộ mã nhận hàng)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Chi tiết đơn"
  }
}
```

## POST /shop/manage/orders/{id}/status
Chuyển trạng thái đơn theo máy trạng thái (SHIPPING bắt buộc trackingCode)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "status"
  ],
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "CANCELLED",
        "READY_FOR_PICKUP",
        "PROCESSING",
        "SHIPPING",
        "DELIVERED",
        "COMPLETED",
        "NOT_PICKED_UP",
        "REFUND_REQUESTED"
      ]
    },
    "reason": {
      "type": "string"
    },
    "trackingCode": {
      "type": "string"
    },
    "carrier": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đơn sau khi chuyển"
  },
  "409": {
    "description": "ORDER_INVALID_TRANSITION / ORDER_STATE_CHANGED"
  }
}
```

## POST /shop/manage/pickup/verify
Tra mã nhận hàng (QR `SCMS-PICKUP:<mã đơn>:<mã>` hoặc nhập tay) ⇒ tóm tắt đơn để đối chiếu

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "code"
  ],
  "properties": {
    "code": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Tóm tắt đơn + recipientPhoneMasked"
  },
  "400": {
    "description": "PICKUP_CODE_INVALID"
  }
}
```

## POST /shop/manage/orders/{id}/pickup
Xác nhận giao tại quầy (mã + 4 số cuối SĐT) ⇒ COMPLETED; mã dùng một lần

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "code",
    "phoneLast4"
  ],
  "properties": {
    "code": {
      "type": "string"
    },
    "phoneLast4": {
      "type": "string"
    },
    "cashCollected": {
      "type": "boolean",
      "description": "Đơn trả tại quầy: đã thu đủ tiền mặt"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đơn hoàn tất"
  },
  "400": {
    "description": "PICKUP_CODE_INVALID / PHONE_MISMATCH (kèm remainingAttempts) / CASH_COLLECTION_REQUIRED"
  },
  "409": {
    "description": "PICKUP_CODE_USED / ORDER_NOT_READY"
  },
  "423": {
    "description": "PICKUP_LOCKED (kèm lockedUntil)"
  }
}
```

## POST /shop/manage/orders/{id}/remind-refund-bank
Nhắc khách gửi số tài khoản nhận hoàn (yêu cầu hoàn đang chờ, chưa có STK) — tối đa 1 lần/giờ

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Chi tiết đơn (Manager)"
  },
  "409": {
    "description": "REFUND_NOT_PENDING / REFUND_BANK_INFO_PRESENT"
  },
  "429": {
    "description": "REFUND_REMINDER_TOO_SOON"
  }
}
```

## GET /shop/manage/inventory
Tồn kho (stock, reserved, available, lowStock) — sắp hết lên đầu

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "lowStock",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false"
      ]
    }
  },
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "data[] + lowStockCount + pagination"
  }
}
```

## POST /shop/manage/inventory/{productId}
Nhập hàng (IN, số dương) / điều chỉnh (ADJUST, ±) — ghi nhật ký kho

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "productId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "type",
    "quantity",
    "note"
  ],
  "properties": {
    "type": {
      "type": "string",
      "enum": [
        "IN",
        "ADJUST"
      ]
    },
    "quantity": {
      "type": "integer"
    },
    "note": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ stockQuantity, reservedStock, availableStock }"
  },
  "409": {
    "description": "STOCK_BELOW_RESERVED"
  }
}
```

## GET /shop/manage/inventory/{productId}/transactions
Nhật ký kho của sản phẩm

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "productId",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "[{ type, quantity, stockAfter, reservedAfter, order{code}, note, createdAt }]"
  }
}
```

## GET /shop/manage/reviews
Đánh giá sản phẩm (lọc sản phẩm / đang ẩn)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "productId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "hidden",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Danh sách đánh giá"
  }
}
```

## PATCH /shop/manage/reviews/{id}
Ẩn / hiện đánh giá (điểm trung bình tính lại, không tính đánh giá ẩn)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "isHidden"
  ],
  "properties": {
    "isHidden": {
      "type": "boolean"
    },
    "reason": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đánh giá sau khi cập nhật"
  }
}
```

## GET /rooms
Get list of rooms

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    },
    "description": "Search by room name"
  },
  {
    "in": "query",
    "name": "areaType",
    "schema": {
      "type": "string",
      "enum": [
        "POOL",
        "INDOOR",
        "OUTDOOR"
      ]
    },
    "description": "Filter by area type (POOL | INDOOR | OUTDOOR)"
  },
  {
    "in": "query",
    "name": "isActive",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer",
      "default": 1
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer",
      "default": 10
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated list of rooms (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Rooms retrieved successfully",
            "data": [
              {
                "id": "c3e1ef3e-0000-4000-8000-000000000101",
                "name": "Yoga Room A",
                "capacity": 20,
                "location": "Floor 1",
                "areaType": "INDOOR",
                "isActive": true
              }
            ],
            "pagination": {
              "page": 1,
              "limit": 10,
              "total": 2,
              "totalPages": 1
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /rooms
Create a new room

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "name",
    "capacity"
  ],
  "properties": {
    "name": {
      "type": "string",
      "example": "Phòng Functional A"
    },
    "capacity": {
      "type": "integer",
      "example": 20
    },
    "location": {
      "type": "string",
      "description": "Khu vực trong trung tâm",
      "example": "Khu tạ tự do"
    },
    "floor": {
      "type": "string",
      "example": "Tầng 2"
    },
    "directions": {
      "type": "string",
      "example": "Thang máy lên tầng 2, rẽ trái"
    },
    "areaType": {
      "type": "string",
      "enum": [
        "POOL",
        "INDOOR",
        "OUTDOOR"
      ],
      "example": "INDOOR"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Room created",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Room created successfully",
            "data": {
              "id": "c3e1ef3e-0000-4000-8000-000000000103",
              "name": "Boxing Room",
              "capacity": 12,
              "areaType": "INDOOR",
              "isActive": true
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /rooms/{id}
View room details

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single room",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Room retrieved successfully",
            "data": {
              "id": "c3e1ef3e-0000-4000-8000-000000000101",
              "name": "Yoga Room A",
              "capacity": 20,
              "location": "Floor 1",
              "areaType": "INDOOR",
              "isActive": true
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /rooms/{id}
Update room info

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "capacity": {
      "type": "integer"
    },
    "location": {
      "type": "string"
    },
    "floor": {
      "type": "string"
    },
    "directions": {
      "type": "string"
    },
    "areaType": {
      "type": "string",
      "enum": [
        "POOL",
        "INDOOR",
        "OUTDOOR"
      ],
      "description": "New area type. Upcoming schedules must use a matching Class."
    },
    "isActive": {
      "type": "boolean"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single room",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Room retrieved successfully",
            "data": {
              "id": "c3e1ef3e-0000-4000-8000-000000000101",
              "name": "Yoga Room A",
              "capacity": 20,
              "location": "Floor 1",
              "areaType": "INDOOR",
              "isActive": true
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## DELETE /rooms/{id}
Deactivate room (soft delete)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single room",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Room retrieved successfully",
            "data": {
              "id": "c3e1ef3e-0000-4000-8000-000000000101",
              "name": "Yoga Room A",
              "capacity": 20,
              "location": "Floor 1",
              "areaType": "INDOOR",
              "isActive": true
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /rooms/{roomId}/transfer-schedules/preview
Preview bulk transfer of upcoming schedules to another room (no DB changes)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "roomId",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "Source room (damaged room)"
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "targetRoomId"
  ],
  "properties": {
    "targetRoomId": {
      "type": "string",
      "description": "Target room ID"
    },
    "from": {
      "type": "string",
      "format": "date-time",
      "description": "Optional lower bound (default now)"
    },
    "to": {
      "type": "string",
      "format": "date-time",
      "description": "Optional upper bound"
    },
    "reason": {
      "type": "string",
      "maxLength": 500,
      "description": "Transfer reason, e.g. Room damaged"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Preview with totalSchedules/validSchedules/invalidSchedules/canTransfer/conflicts"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /rooms/{roomId}/transfer-schedules
Bulk transfer upcoming SCHEDULED schedules to another room (atomic, all-or-nothing)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "roomId",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "Source room (damaged room)"
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "targetRoomId"
  ],
  "properties": {
    "targetRoomId": {
      "type": "string",
      "description": "Target room ID"
    },
    "from": {
      "type": "string",
      "format": "date-time",
      "description": "Optional lower bound (default now)"
    },
    "to": {
      "type": "string",
      "format": "date-time",
      "description": "Optional upper bound"
    },
    "reason": {
      "type": "string",
      "maxLength": 500,
      "description": "Transfer reason, e.g. Room damaged"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Transferred with sourceRoom/targetRoom/transferredCount/schedules"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /reports/revenue
Revenue report (total, by method, recent payments)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "startDate",
    "required": true,
    "schema": {
      "type": "string",
      "example": "2026-01-01"
    }
  },
  {
    "in": "query",
    "name": "endDate",
    "required": true,
    "schema": {
      "type": "string",
      "example": "2026-12-31"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Revenue report",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Revenue report retrieved successfully",
            "data": {
              "totalRevenue": 900000,
              "refundedAmount": 300000,
              "netRevenue": 600000,
              "totalPayments": 3,
              "successPayments": 2,
              "refundedPayments": 1,
              "failedPayments": 0,
              "pendingPayments": 0,
              "revenueByMethod": {
                "CASH": 300000,
                "BANK_TRANSFER": 600000,
                "SEPAY": 300000
              },
              "recentPayments": [
                {
                  "id": "322da21d-5040-44b8-90cc-cfc9eeff2631",
                  "amount": "600000",
                  "status": "SUCCESS",
                  "member": {
                    "user": {
                      "fullName": "John Doe"
                    }
                  }
                }
              ]
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /reports/members
Member report (total, new, active, by tier)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "startDate",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "endDate",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Member report",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Member report retrieved successfully",
            "data": {
              "totalMembers": 3,
              "newMembers": 1,
              "activeMembers": 2,
              "expiredMembers": 1,
              "membersByTier": {
                "FREE": 1,
                "MEMBERSHIP": 1,
                "PREMIUM": 1
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /reports/enrollments
Enrollment report (top classes, by type)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "startDate",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "endDate",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Enrollment report",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Enrollment report retrieved successfully",
            "data": {
              "totalEnrollments": 5,
              "cancelledEnrollments": 1,
              "topClasses": [
                {
                  "classId": "class-yoga-001",
                  "className": "Morning Yoga",
                  "count": 3
                }
              ],
              "enrollmentsByClassType": {
                "REGULAR": 4,
                "PREMIUM": 1
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /reports/memberships
Membership subscription report (by status, tier, revenue)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "startDate",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "endDate",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /reports/subscription-logs
Detailed log of subscription purchases

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "startDate",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "endDate",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer",
      "default": 1
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer",
      "default": 20
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /reports/attendance
Attendance report per (member × class) with OK/WARN/RELEASE status

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "OK",
        "WARN",
        "RELEASE"
      ]
    }
  },
  {
    "in": "query",
    "name": "classId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "memberId",
    "schema": {
      "type": "string",
      "description": "MemberProfile.id"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer",
      "default": 1
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer",
      "default": 20
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Attendance report",
    "content": {
      "application/json": {
        "example": {
          "success": true,
          "message": "Attendance report retrieved successfully",
          "data": {
            "summary": {
              "total": 12,
              "ok": 9,
              "warn": 2,
              "release": 1
            },
            "rows": [
              {
                "memberId": "member-uuid",
                "memberName": "Nguyễn Văn A",
                "classId": "class-uuid",
                "className": "Yoga cơ bản",
                "sampleSize": 8,
                "presentCount": 5,
                "lateCount": 0,
                "absentCount": 2,
                "noShowCount": 1,
                "excusedCount": 1,
                "attendanceRate": 62.5,
                "status": "RELEASE",
                "activePenalty": null
              }
            ]
          },
          "pagination": {
            "page": 1,
            "limit": 20,
            "total": 12,
            "totalPages": 1
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /refunds/course-cancellation
MEMBER hủy khóa học (≥ 3 ngày ⇒ hoàn 100%; muộn hơn ⇒ hủy không hoàn hoặc xin hoàn ngoại lệ)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "classId"
  ],
  "properties": {
    "classId": {
      "type": "string"
    },
    "note": {
      "type": "string",
      "maxLength": 500,
      "description": "Lý do hủy (tuỳ chọn)"
    },
    "bankName": {
      "type": "string",
      "maxLength": 100,
      "description": "Tên ngân hàng (VD: MBBank, VCB, Techcombank)"
    },
    "bankAccountNumber": {
      "type": "string",
      "maxLength": 50,
      "description": "Số tài khoản nhận tiền"
    },
    "bankAccountName": {
      "type": "string",
      "maxLength": 100,
      "description": "Tên chủ tài khoản"
    },
    "lateRefund": {
      "type": "boolean",
      "description": "Hủy < 3 ngày: true ⇒ xin hoàn ngoại lệ (Manager duyệt, trừ phí)"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đã hủy ngay",
    "không hoàn tiền (hủy trong vòng 3 ngày trước khai giảng)": null
  },
  "201": {
    "description": "Đã tạo yêu cầu hoàn (REFUND_REQUESTED 100% hoặc LATE_REFUND_REQUESTED ngoại lệ)"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /refunds/my
MEMBER xem các yêu cầu hoàn tiền của mình

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "PENDING",
        "COMPLETED",
        "REJECTED",
        "CANCELLED"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /refunds
MANAGER xem danh sách yêu cầu hoàn tiền

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "PENDING",
        "COMPLETED",
        "REJECTED",
        "CANCELLED"
      ]
    }
  },
  {
    "in": "query",
    "name": "reason",
    "schema": {
      "type": "string",
      "enum": [
        "MEMBER_CANCEL_COURSE",
        "MEMBER_CANCEL_SESSION",
        "SESSION_CANCELLED",
        "ORDER_CANCELLED",
        "ORDER_NOT_PICKED_UP",
        "ORDER_LATE_PAYMENT",
        "COURSE_NOT_FULFILLED"
      ]
    }
  },
  {
    "in": "query",
    "name": "memberId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "classId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "orderId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## PATCH /refunds/{id}/approve
MANAGER duyệt hoàn tiền (sau khi đã chuyển khoản tay cho hội viên)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "note": {
      "type": "string",
      "maxLength": 500,
      "description": "Ghi chú duyệt hoàn tiền"
    },
    "transactionRef": {
      "type": "string",
      "maxLength": 100,
      "description": "Mã giao dịch ngân hàng thực tế (FT code)"
    },
    "feePercent": {
      "type": "integer",
      "minimum": 0,
      "maximum": 99,
      "description": "Chỉ với MEMBER_CANCEL_COURSE_LATE: % phí chiết khấu chốt khi duyệt (hoàn = grossAmount × (100 − phí)%)"
    },
    "payoutMethod": {
      "type": "string",
      "enum": [
        "BANK_TRANSFER",
        "CASH"
      ],
      "description": "Cách trả tiền hoàn (mặc định BANK_TRANSFER). Hoàn đơn hàng bằng chuyển khoản cần khách đã gửi STK — thiếu ⇒ 409 REFUND_BANK_INFO_REQUIRED"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đã duyệt"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  }
}
```

## GET /refunds/summary
Thống kê số lượng & số tiền hoàn theo trạng thái và lý do (MANAGER)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ totalCount, pending: {count, amount}, completed: {count, amount}, rejected: {count, amount}, cancelled: {count, amount}, byReason: {...} }"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /refunds/course-cancellation/preview
BE-16: Xem trước điều kiện hủy khóa (MEMBER) — không ghi dữ liệu

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "classId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ allowed, mode, refundPercent, fullRefundDeadline, deadline, firstSessionStart, paidAmount, refundableAmount, estimatedRefundAmount, futureBookedSessions, blockReason, blockMessage, existingRefundId }"
  }
}
```

## GET /refunds/{id}
BE-17: Chi tiết yêu cầu hoàn tiền (MANAGER: mọi bản ghi; MEMBER: của mình)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Refund kèm member, class (+coach), schedule, payment"
  },
  "403": {
    "description": "Không phải của mình"
  },
  "404": {
    "description": "Không tìm thấy"
  }
}
```

## PATCH /refunds/{id}/reject
MANAGER từ chối hoàn tiền (kèm lý do)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "reason"
  ],
  "properties": {
    "reason": {
      "type": "string",
      "minLength": 3,
      "maxLength": 500
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đã từ chối"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  }
}
```

## PATCH /refunds/{id}/cancel
MEMBER/COACH tự hủy yêu cầu hoàn tiền của mình khi còn PENDING

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Refund với status CANCELLED"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  }
}
```

## GET /products
List products (default — only products on sale)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "isActive",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false",
        "all"
      ]
    },
    "description": "Mặc định true (đang bán). false = đã ngừng bán, all = tất cả (cho Manager)."
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  }
}
```

## POST /products
Create a new product (Manager only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "name",
    "description",
    "price",
    "stockQuantity"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 2
    },
    "description": {
      "type": "string",
      "minLength": 5
    },
    "price": {
      "type": "number",
      "minimum": 0
    },
    "stockQuantity": {
      "type": "integer",
      "minimum": 0,
      "description": "Tồn đầu — ghi đúng 1 dòng nhật ký kho IN"
    },
    "isActive": {
      "type": "boolean"
    },
    "imageUrl": {
      "type": "string",
      "format": "binary",
      "description": "Chọn file ảnh hoặc truyền URL string"
    },
    "imageUrls": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "maxItems": 10
    },
    "maxPerOrder": {
      "type": "integer",
      "minimum": 1
    },
    "maxPerDay": {
      "type": "integer",
      "minimum": 1
    },
    "lowStockThreshold": {
      "type": "integer",
      "minimum": 0
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Created"
  }
}
```

## GET /products/{id}
Get product details by ID

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  }
}
```

## PATCH /products/{id}
Update an existing product (Manager only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "price": {
      "type": "number",
      "description": "Đổi giá không ảnh hưởng OrderItem đã đặt (snapshot)"
    },
    "stockQuantity": {
      "type": "integer",
      "description": "API cũ — nên dùng POST /shop/manage/inventory/{productId}"
    },
    "isActive": {
      "type": "boolean",
      "description": "false = ngừng bán (giữ đơn/đánh giá/nhật ký kho)"
    },
    "imageUrl": {
      "type": "string",
      "format": "uri",
      "nullable": true
    },
    "imageUrls": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "maxItems": 10
    },
    "maxPerOrder": {
      "type": "integer",
      "minimum": 1
    },
    "maxPerDay": {
      "type": "integer",
      "minimum": 1
    },
    "lowStockThreshold": {
      "type": "integer",
      "minimum": 0
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  }
}
```

## DELETE /products/{id}
Xóa vĩnh viễn sản phẩm chưa có đơn/đánh giá (Manager) — đã có lịch sử ⇒ 409, hãy ngừng bán

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "PRODUCT_HAS_HISTORY (kèm orderItems, reviews, reservedStock)"
  }
}
```

## POST /products/orders
Create an order (multiple products) and its SePay (VietQR) payment

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "items"
  ],
  "properties": {
    "items": {
      "type": "array",
      "minItems": 1,
      "description": "Các sản phẩm trong đơn (cùng productId lặp lại sẽ được cộng dồn số lượng)",
      "items": {
        "type": "object",
        "required": [
          "productId",
          "quantity"
        ],
        "properties": {
          "productId": {
            "type": "string"
          },
          "quantity": {
            "type": "integer",
            "minimum": 1
          }
        }
      }
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Đơn PENDING_PAYMENT + thông tin QR (paymentId, orderCode, amount, qrUrl, expiresAt, order{ id, totalPrice, status, items[{ productId, productName, quantity, unitPrice, totalAmount }] })"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  },
  "503": {
    "description": "Chưa cấu hình tài khoản nhận tiền SePay"
  }
}
```

## POST /products/orders/{id}/cancel
Cancel a PENDING_PAYMENT order (releases reserved stock)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đơn đã hủy, kho đã được hoàn lại"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /products/my/orders
Get my orders (with items)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  }
}
```

## POST /products/{id}/reviews
Add a review for a product

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "rating"
  ],
  "properties": {
    "rating": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5
    },
    "comment": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Created"
  }
}
```

## POST /products/upload-image
Upload product image file (Manager only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  }
}
```

## POST /payments
Ghi nhận thanh toán khóa học tại quầy (Manager only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "memberId",
    "amount",
    "method"
  ],
  "properties": {
    "memberId": {
      "type": "string",
      "description": "MemberProfile.id hoặc User.id"
    },
    "classId": {
      "type": "string",
      "description": "Class.id (lớp APPROVED)"
    },
    "amount": {
      "type": "number",
      "description": "Bằng đúng giá khóa học (VND)"
    },
    "method": {
      "type": "string",
      "enum": [
        "CASH",
        "BANK_TRANSFER"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "PENDING",
        "SUCCESS",
        "FAILED"
      ],
      "default": "SUCCESS"
    },
    "note": {
      "type": "string"
    },
    "transactionCode": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Payment recorded",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Payment recorded successfully",
            "data": {
              "id": "322da21d-5040-44b8-90cc-cfc9eeff2631",
              "amount": "300000",
              "method": "CASH",
              "status": "SUCCESS",
              "paidAt": "2026-09-12T08:00:00.000Z",
              "member": {
                "user": {
                  "fullName": "John Doe"
                }
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Body không hợp lệ / lớp chưa APPROVED / lớp miễn phí / sai số tiền (AMOUNT_MISMATCH)"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Không tìm thấy hội viên hoặc lớp"
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /payments
List payments with filters

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "memberId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "PENDING",
        "SUCCESS",
        "FAILED",
        "REFUNDED"
      ]
    }
  },
  {
    "in": "query",
    "name": "method",
    "schema": {
      "type": "string",
      "enum": [
        "CASH",
        "BANK_TRANSFER",
        "SEPAY"
      ]
    }
  },
  {
    "in": "query",
    "name": "startDate",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "endDate",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated list of payments (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Payments retrieved successfully",
            "data": [
              {
                "id": "322da21d-5040-44b8-90cc-cfc9eeff2631",
                "amount": "300000",
                "method": "CASH",
                "status": "SUCCESS",
                "paidAt": "2026-09-12T08:00:00.000Z",
                "member": {
                  "user": {
                    "fullName": "John Doe",
                    "email": "member1@example.com"
                  }
                }
              }
            ],
            "pagination": {
              "page": 1,
              "limit": 10,
              "total": 2,
              "totalPages": 1
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /payments/{id}
Get payment by ID

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single payment",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Payment retrieved successfully",
            "data": {
              "id": "322da21d-5040-44b8-90cc-cfc9eeff2631",
              "amount": "300000",
              "method": "CASH",
              "status": "SUCCESS",
              "member": {
                "user": {
                  "fullName": "John Doe"
                }
              },
              "subscription": {
                "plan": {
                  "name": "Membership Monthly",
                  "tier": "MEMBERSHIP"
                }
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /payments/my
BE-6: Lịch sử thanh toán của tôi (MEMBER: khóa học + đơn hàng; COACH: đơn hàng)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "type",
    "schema": {
      "type": "string",
      "enum": [
        "CLASS",
        "ORDER",
        "MEMBERSHIP"
      ]
    }
  },
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "PENDING",
        "SUCCESS",
        "FAILED",
        "REFUNDED"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "[{ id, type, amount, status, paidAt, transactionCode, classId, className, orderId, items[], refundedAmount }]"
  }
}
```

## GET /payments/my/{id}/invoice
Hóa đơn chi tiết của giao dịch của tôi (người bán, người mua, dòng hàng, tạm tính, giảm, phí ship, tổng, hoàn tiền)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ invoiceNumber, kind, seller, buyer, lines[{no,name,unit,quantity,unitPrice,amount}], subtotal, discount, discountLabel, shippingFee, total, refunds[], refundedAmount, netAmount, course, membership, order }"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /payments/{id}/invoice
MANAGER — hóa đơn chi tiết của một giao dịch (cùng định dạng /payments/my/{id}/invoice)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Hóa đơn"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## PATCH /payments/{id}/status
Update payment status (thanh toán tại quầy)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "status"
  ],
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "PENDING",
        "SUCCESS",
        "FAILED",
        "REFUNDED"
      ]
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single payment",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Payment retrieved successfully",
            "data": {
              "id": "322da21d-5040-44b8-90cc-cfc9eeff2631",
              "amount": "300000",
              "method": "CASH",
              "status": "SUCCESS",
              "member": {
                "user": {
                  "fullName": "John Doe"
                }
              },
              "subscription": {
                "plan": {
                  "name": "Membership Monthly",
                  "tier": "MEMBERSHIP"
                }
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /payments/{id}/retry-activation
Kích hoạt bù khóa học cho giao dịch SePay đã thu tiền nhưng chưa ghi danh (Manager only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single payment",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Payment retrieved successfully",
            "data": {
              "id": "322da21d-5040-44b8-90cc-cfc9eeff2631",
              "amount": "300000",
              "method": "CASH",
              "status": "SUCCESS",
              "member": {
                "user": {
                  "fullName": "John Doe"
                }
              },
              "subscription": {
                "plan": {
                  "name": "Membership Monthly",
                  "tier": "MEMBERSHIP"
                }
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /payments/sepay/checkout
Member tạo đơn chuyển khoản VietQR (SePay) để tự mua khóa học

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "classId"
  ],
  "properties": {
    "classId": {
      "type": "string",
      "description": "Class.id (lớp APPROVED, giá > 0)"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Đơn đã tạo — trả ảnh VietQR + thông tin chuyển khoản",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true,
          "message": "SePay checkout created successfully",
          "data": {
            "paymentId": "c1a2b3c4-0000-0000-0000-000000000001",
            "orderCode": "SEVQR12345678",
            "amount": 450000,
            "currency": "VND",
            "status": "PENDING",
            "gateway": "SEPAY",
            "expiresAt": "2026-10-04T15:30:00.000Z",
            "qrUrl": "https://qr.sepay.vn/img?acc=0703339186&bank=SACOMBANK&amount=450000&des=SEVQR12345678&template=compact",
            "transferContent": "SEVQR12345678",
            "bank": {
              "id": "SACOMBANK",
              "accountNumber": "0703339186",
              "accountHolder": "NGUYEN TRAN TU"
            },
            "classInfo": {
              "id": "class-hiit-001",
              "name": "HIIT Cardio"
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Lớp chưa APPROVED / lớp miễn phí / user không phải MEMBER đang hoạt động",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "examples": {
          "not_approved": {
            "value": {
              "success": false,
              "message": "Class is not yet approved"
            }
          },
          "free_class": {
            "value": {
              "success": false,
              "message": "Khóa học miễn phí, không cần thanh toán."
            }
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Không thấy lớp hoặc lớp đã ngừng (isActive = false)"
  },
  "409": {
    "description": "Còn giao dịch chuyển khoản PENDING cho cùng lớp (chưa quá TTL) — trả kèm QR để FE tiếp tục",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": false,
          "message": "Bạn đang có giao dịch chuyển khoản chờ thanh toán cho khóa học \"HIIT Cardio\". Vui lòng hoàn tất hoặc thử lại sau 14 phút.",
          "errors": {
            "code": "SEPAY_PAYMENT_PENDING",
            "gateway": "SEPAY",
            "paymentId": "c1a2b3c4-0000-0000-0000-000000000001",
            "orderCode": "SEVQR12345678",
            "amount": 450000,
            "expiresAt": "2026-10-04T15:30:00.000Z",
            "qrUrl": "https://qr.sepay.vn/img?acc=0703339186&bank=SACOMBANK&amount=450000&des=SEVQR12345678",
            "transferContent": "SEVQR12345678"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  },
  "503": {
    "description": "Chưa cấu hình tài khoản nhận tiền (VIETQR_BANK_ID / VIETQR_ACCOUNT_NO)"
  }
}
```

## POST /payments/sepay/webhook
SePay gọi server-to-server khi phát hiện giao dịch chuyển khoản

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "header",
    "name": "Authorization",
    "required": false,
    "schema": {
      "type": "string"
    },
    "description": "`Apikey <SEPAY_WEBHOOK_API_KEY>` (phương thức API Key)"
  },
  {
    "in": "header",
    "name": "X-SePay-Signature",
    "required": false,
    "schema": {
      "type": "string"
    },
    "description": "`sha256={hex}` — chữ ký HMAC-SHA256 (phương thức HMAC)"
  },
  {
    "in": "header",
    "name": "X-SePay-Timestamp",
    "required": false,
    "schema": {
      "type": "string"
    },
    "description": "Unix timestamp (seconds) khi SePay ký — tham gia nội dung ký"
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "id",
    "transferType",
    "transferAmount",
    "accountNumber"
  ],
  "properties": {
    "id": {
      "type": "integer",
      "description": "ID giao dịch trên SePay — khoá chống trùng"
    },
    "gateway": {
      "type": "string",
      "description": "Tên ngân hàng, VD SACOMBANK"
    },
    "transactionDate": {
      "type": "string",
      "description": "YYYY-MM-DD HH:mm:ss (giờ VN)"
    },
    "accountNumber": {
      "type": "string"
    },
    "subAccount": {
      "type": "string",
      "description": "Số VA nếu có, rỗng nếu không"
    },
    "code": {
      "type": "string",
      "nullable": true,
      "description": "Mã thanh toán SePay bóc tách được, VD SEVQR12345678"
    },
    "content": {
      "type": "string",
      "description": "Nội dung chuyển khoản gốc"
    },
    "transferType": {
      "type": "string",
      "enum": [
        "in",
        "out"
      ]
    },
    "description": {
      "type": "string"
    },
    "transferAmount": {
      "type": "integer"
    },
    "accumulated": {
      "type": "integer"
    },
    "referenceCode": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đã ghi nhận (SePay không cần retry) — kể cả khi lệch tiền/tài khoản hoặc lặp webhook",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true
        }
      }
    }
  },
  "400": {
    "description": "Payload không hợp lệ (thiếu id/transferType/transferAmount…)"
  },
  "401": {
    "description": "Xác thực không hợp lệ (API key sai hoặc chữ ký HMAC sai)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": false,
          "message": "Chữ ký webhook SePay không hợp lệ.",
          "errors": {
            "code": "SEPAY_INVALID_SIGNATURE",
            "gateway": "SEPAY",
            "sepayId": 92704
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  },
  "503": {
    "description": "Server chưa cấu hình webhook SePay (SEPAY_WEBHOOK_API_KEY / SEPAY_WEBHOOK_SECRET)"
  }
}
```

## POST /payments/sepay/mock-confirm
DEV/DEMO — mô phỏng SePay xác nhận đã thu tiền (chỉ khi SEPAY_MOCK_MODE=true)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "paymentId"
  ],
  "properties": {
    "paymentId": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đã mô phỏng giao dịch chuyển khoản thành công",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true,
          "message": "SePay payment simulated successfully",
          "data": {
            "sepayId": 1927040001,
            "orderCode": "SEVQR12345678",
            "paymentId": "c1a2b3c4-0000-0000-0000-000000000001",
            "processed": true,
            "status": "PROCESSED",
            "paymentStatus": "SUCCESS",
            "mock": true
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Không phải chủ giao dịch / mock mode đang tắt"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /payments/sepay/{id}
Xem trạng thái giao dịch chuyển khoản SePay (FE polling sau khi hội viên CK)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "Payment.id nhận được từ `POST /payments/sepay/checkout` hoặc `POST /products/orders`"
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Thông tin đơn + trạng thái hiện tại",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "examples": {
          "pending": {
            "summary": "Chưa nhận được tiền",
            "value": {
              "success": true,
              "message": "SePay checkout retrieved successfully",
              "data": {
                "paymentId": "c1a2b3c4-0000-0000-0000-000000000001",
                "orderCode": "SEVQR12345678",
                "amount": 450000,
                "currency": "VND",
                "status": "PENDING",
                "gateway": "SEPAY",
                "expiresAt": "2026-10-04T15:30:00.000Z",
                "qrUrl": "https://qr.sepay.vn/img?acc=0703339186&bank=SACOMBANK&amount=450000&des=SEVQR12345678&template=compact",
                "transferContent": "SEVQR12345678",
                "bank": {
                  "id": "SACOMBANK",
                  "accountNumber": "0703339186",
                  "accountHolder": "NGUYEN TRAN TU"
                },
                "classInfo": {
                  "id": "class-hiit-001",
                  "name": "HIIT Cardio"
                },
                "classId": "class-hiit-001",
                "orderId": null,
                "paidAt": null
              }
            }
          },
          "paid": {
            "summary": "Đơn sản phẩm — webhook đã xác nhận thu tiền",
            "value": {
              "success": true,
              "message": "SePay checkout retrieved successfully",
              "data": {
                "paymentId": "c1a2b3c4-0000-0000-0000-000000000002",
                "orderCode": "SEVQR87654321",
                "amount": 850000,
                "status": "SUCCESS",
                "activationStatus": "ACTIVATED",
                "classId": null,
                "orderId": "d2b3c4d5-0000-0000-0000-000000000001",
                "paidAt": "2026-10-04T11:08:35.000Z"
              }
            }
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Không phải chủ giao dịch"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /notifications
Get my notifications

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "type",
    "schema": {
      "type": "string",
      "enum": [
        "MEMBER_REGISTERED",
        "CHAT_MESSAGE",
        "SUBSCRIPTION_EXPIRING",
        "SUBSCRIPTION_EXPIRED",
        "SUBSCRIPTION_CANCELLED",
        "UPCOMING_CLASS",
        "SCHEDULE_CANCELLED",
        "SCHEDULE_UPDATED",
        "ENROLLMENT_CONFIRMED",
        "ENROLLMENT_CANCELLED",
        "TRAINING_PLAN_ASSIGNED",
        "NEW_CLASS",
        "COACH_CHANGED",
        "PAYMENT_SUCCESS",
        "PAYMENT_REFUNDED",
        "PAYMENT_FAILED"
      ]
    },
    "description": "Filter by notification type"
  },
  {
    "in": "query",
    "name": "isRead",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false"
      ]
    },
    "description": "Filter by read status"
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer",
      "default": 1
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer",
      "default": 20
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "A list of notifications"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /notifications/unread-count
Get count of unread notifications

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Unread count retrieved successfully"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /notifications/mark-all-read
Mark all my notifications as read

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "All notifications marked as read"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /notifications/{id}/read
Mark a specific notification as read

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "Notification ID"
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Notification marked as read"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /notifications/trigger-upcoming-reminders
Manually trigger upcoming class reminders (within 24h)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Reminders triggered successfully"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /membership-plans
Danh sách gói thành viên đang bán (theo thứ tự Manager đặt, rồi giá tăng dần)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  }
}
```

## POST /membership-plans
MANAGER tạo gói thành viên

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "name",
    "durationDays",
    "price"
  ],
  "properties": {
    "name": {
      "type": "string",
      "example": "Gói 1 tháng"
    },
    "durationDays": {
      "type": "integer",
      "example": 30
    },
    "price": {
      "type": "integer",
      "example": 500000
    },
    "description": {
      "type": "string"
    },
    "benefits": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "example": [
        "Tập không giới hạn giờ mở cửa",
        "Tủ đồ miễn phí"
      ]
    },
    "isFeatured": {
      "type": "boolean"
    },
    "sortOrder": {
      "type": "integer"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Đã tạo"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /membership-plans/manage
MANAGER — mọi gói (cả gói đã tắt) kèm số liệu (hội viên đang dùng, lượt bán, doanh thu, đã hoàn)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## PATCH /membership-plans/{id}
MANAGER sửa gói (đổi giá / số ngày chỉ áp dụng cho giao dịch mới)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "durationDays": {
      "type": "integer"
    },
    "price": {
      "type": "integer"
    },
    "description": {
      "type": "string"
    },
    "benefits": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "isFeatured": {
      "type": "boolean"
    },
    "sortOrder": {
      "type": "integer"
    },
    "isActive": {
      "type": "boolean"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "PLAN_NAME_TAKEN"
  }
}
```

## DELETE /membership-plans/{id}
MANAGER xóa gói chưa từng bán (đã bán ⇒ 409 PLAN_IN_USE, hãy tắt bán)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "409": {
    "description": "PLAN_IN_USE"
  }
}
```

## PATCH /membership-plans/{id}/toggle
MANAGER bật/tắt gói (bỏ trống isActive ⇒ đảo trạng thái)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "isActive": {
      "type": "boolean"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## POST /memberships/purchase
MEMBER mua gói — tạo giao dịch VietQR (SePay) chờ chuyển khoản

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "planId"
  ],
  "properties": {
    "planId": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Đã tạo giao dịch chờ thanh toán"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "SEPAY_PAYMENT_PENDING — còn giao dịch mua gói đang chờ (body kèm QR cũ)"
  },
  "503": {
    "description": "Chưa cấu hình SePay"
  }
}
```

## GET /memberships/my
Gói thành viên đang hiệu lực của tôi

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /memberships/my/history
MEMBER — lịch sử mọi gói đã mua (tên/giá theo ảnh chụp lúc mua)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  }
}
```

## GET /memberships/my/pass
MEMBER — mã QR động của thẻ thành viên (JWT sống 60 giây, app tự làm mới)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ token, expiresIn, expiresAt, isActive, validUntil }"
  }
}
```

## POST /memberships/pass/verify
MANAGER/COACH quét mã QR động của hội viên ⇒ hợp lệ hay không + ghi nhật ký vào cửa

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "token"
  ],
  "properties": {
    "token": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ valid, reason, member, membership, validUntil, totalDaysLeft, entriesToday }"
  },
  "400": {
    "description": "PASS_EXPIRED / PASS_INVALID"
  }
}
```

## GET /memberships/pass/scans
MANAGER — nhật ký quét thẻ hội viên

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "valid",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  }
}
```

## POST /memberships/maintenance
MANAGER — chạy ngay job gói thành viên (hết hạn + nhắc gia hạn 7 ngày / 1 ngày; cũng chạy định kỳ)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ remindedDays7, remindedDays1, expired }"
  }
}
```

## POST /memberships/{id}/cancel
MANAGER hủy gói của hội viên (gói xếp hàng phía sau dời lên; hoàn tiền tùy chọn ≤ giá trị còn lại)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "reason"
  ],
  "properties": {
    "reason": {
      "type": "string"
    },
    "refundAmount": {
      "type": "integer",
      "description": "0 = không hoàn"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ membershipId, refund, shiftedQueued, maxRefund }"
  },
  "400": {
    "description": "REFUND_EXCEEDS_REMAINING"
  },
  "409": {
    "description": "MEMBERSHIP_NOT_ACTIVE"
  }
}
```

## GET /memberships/verify/{userId}
COACH/MANAGER tra cứu gói của hội viên theo userId (KHÔNG dùng vào cửa — vào cửa dùng /memberships/pass/verify)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "userId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ user: {id, fullName, avatarUrl}, membership: {status, planName, endDate, daysLeft} | null, isActive }"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /memberships
MANAGER xem danh sách membership

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "ACTIVE",
        "EXPIRED",
        "CANCELLED"
      ]
    }
  },
  {
    "in": "query",
    "name": "planId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /members
List all members

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "trainingLevel",
    "schema": {
      "type": "string",
      "enum": [
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated list of members (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Members retrieved successfully",
            "data": [
              {
                "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                "fitnessGoal": "Lose weight",
                "trainingLevel": "BEGINNER",
                "trainingPreference": "Morning",
                "user": {
                  "id": "df714df2-8856-48be-bd41-241a04b9f6ad",
                  "email": "member1@example.com",
                  "fullName": "John Doe",
                  "phone": "0900000005",
                  "role": "MEMBER",
                  "isActive": true
                },
                "subscriptions": [
                  {
                    "status": "ACTIVE",
                    "endDate": "2026-10-11T14:20:14.968Z",
                    "plan": {
                      "id": "plan-basic-001",
                      "name": "Membership Monthly",
                      "price": "300000",
                      "tier": "MEMBERSHIP"
                    }
                  }
                ]
              }
            ],
            "pagination": {
              "page": 1,
              "limit": 10,
              "total": 3,
              "totalPages": 1
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /members/{id}
Get member by ID (userId or profileId)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single member with active subscription",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Member retrieved successfully",
            "data": {
              "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4",
              "fitnessGoal": "Lose weight",
              "trainingLevel": "BEGINNER",
              "user": {
                "id": "df714df2-8856-48be-bd41-241a04b9f6ad",
                "email": "member1@example.com",
                "fullName": "John Doe",
                "phone": "0900000005",
                "role": "MEMBER",
                "isActive": true
              },
              "subscriptions": [
                {
                  "status": "ACTIVE",
                  "plan": {
                    "name": "Membership Monthly",
                    "tier": "MEMBERSHIP"
                  }
                }
              ]
            }
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /members/{id}
Update member info

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "fullName": {
      "type": "string"
    },
    "phone": {
      "type": "string"
    },
    "gender": {
      "type": "string",
      "enum": [
        "MALE",
        "FEMALE",
        "OTHER"
      ]
    },
    "dateOfBirth": {
      "type": "string"
    },
    "fitnessGoal": {
      "type": "string"
    },
    "trainingLevel": {
      "type": "string",
      "enum": [
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED"
      ]
    },
    "trainingPreference": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single member with active subscription",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Member retrieved successfully",
            "data": {
              "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4",
              "fitnessGoal": "Lose weight",
              "trainingLevel": "BEGINNER",
              "user": {
                "id": "df714df2-8856-48be-bd41-241a04b9f6ad",
                "email": "member1@example.com",
                "fullName": "John Doe",
                "phone": "0900000005",
                "role": "MEMBER",
                "isActive": true
              },
              "subscriptions": [
                {
                  "status": "ACTIVE",
                  "plan": {
                    "name": "Membership Monthly",
                    "tier": "MEMBERSHIP"
                  }
                }
              ]
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /members/{id}/membership-status
Get member effective tier and active subscription

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "memberProfile.id hoặc userId"
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Effective member tier and active subscription. `effectiveTier` = tier của subscription ACTIVE (FREE | MEMBERSHIP | PREMIUM — FREE chỉ khi member thực sự có gói FREE ACTIVE). Khi member KHÔNG có subscription ACTIVE: `effectiveTier = null`, `activeSubscription = null`, `daysRemaining = null` — nhất quán với GET /enrollments/my/quota (không dùng \"FREE\" để đại diện).",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Membership status retrieved successfully",
            "data": {
              "effectiveTier": "MEMBERSHIP",
              "activeSubscription": {
                "status": "ACTIVE",
                "endDate": "2026-10-11T14:20:14.968Z",
                "plan": {
                  "name": "Membership Monthly",
                  "tier": "MEMBERSHIP"
                }
              },
              "daysRemaining": 21
            }
          }
        },
        "examples": {
          "withActiveSubscription": {
            "summary": "Có gói ACTIVE → effectiveTier = tier của gói",
            "value": {
              "success": true,
              "message": "Membership status retrieved successfully",
              "data": {
                "effectiveTier": "FREE",
                "activeSubscription": {
                  "status": "ACTIVE",
                  "endDate": "2036-09-20T00:00:00.000Z",
                  "plan": {
                    "name": "FREE",
                    "tier": "FREE"
                  }
                },
                "daysRemaining": 3650
              }
            }
          },
          "noActiveSubscription": {
            "summary": "Không có gói ACTIVE → effectiveTier = null (KHÔNG phải \"FREE\")",
            "value": {
              "success": true,
              "message": "Membership status retrieved successfully",
              "data": {
                "effectiveTier": null,
                "activeSubscription": null,
                "daysRemaining": null
              }
            }
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /locations/provinces
Danh sách Tỉnh/Thành (địa giới 2 cấp, kèm `deliverable` = trong khu vực giao hàng)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "[{ code, name, deliverable }]"
  },
  "503": {
    "description": "Nguồn danh mục tạm thời không khả dụng (LOCATIONS_UNAVAILABLE)"
  }
}
```

## GET /locations/provinces/{code}/wards
Phường/Xã của một Tỉnh/Thành (cấp 2)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "code",
    "required": true,
    "schema": {
      "type": "integer"
    },
    "description": "code từ /locations/provinces"
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "[{ code, name }]"
  },
  "404": {
    "description": "Không thấy mã"
  }
}
```

## GET /locations/provinces/{code}/districts
Quận/Huyện (TÙY CHỌN, cấp cũ) của Tỉnh/Thành

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "code",
    "required": true,
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "[{ code, name }] hoặc []"
  },
  "404": {
    "description": "Không thấy mã"
  }
}
```

## POST /feedbacks
Member gửi đánh giá cho HLV

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "coachId",
    "classId",
    "rating"
  ],
  "properties": {
    "coachId": {
      "type": "string",
      "format": "uuid",
      "description": "CoachProfile ID"
    },
    "classId": {
      "type": "string",
      "description": "Khóa học đã học xong (bắt buộc)"
    },
    "rating": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5,
      "description": "Số sao đánh giá (1–5)",
      "example": 5
    },
    "comment": {
      "type": "string",
      "maxLength": 1000,
      "description": "Nhận xét chi tiết",
      "example": "HLV rất nhiệt tình, hướng dẫn chi tiết và dễ hiểu!"
    },
    "isAnonymous": {
      "type": "boolean",
      "default": false,
      "description": "Ẩn tên khi hiển thị công khai"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Gửi đánh giá thành công",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true,
          "message": "Cảm ơn bạn đã gửi đánh giá!",
          "data": {
            "id": "fb-uuid",
            "coachId": "coach-uuid",
            "rating": 5,
            "comment": "HLV rất nhiệt tình!",
            "isAnonymous": false,
            "coach": {
              "user": {
                "fullName": "Nguyễn Văn A"
              }
            },
            "class": {
              "name": "Morning Yoga"
            }
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Chưa học xong khóa (code COURSE_NOT_COMPLETED) — chỉ đánh giá khi mọi buổi chính đã kết thúc và đã thanh toán",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": false,
          "message": "Bạn chỉ có thể đánh giá HLV mà bạn đã hoặc đang học cùng."
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /feedbacks
Xem danh sách đánh giá của một HLV (public)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "coachId",
    "required": true,
    "schema": {
      "type": "string",
      "format": "uuid"
    },
    "description": "CoachProfile ID cần xem đánh giá"
  },
  {
    "in": "query",
    "name": "classId",
    "schema": {
      "type": "string",
      "format": "uuid"
    },
    "description": "Lọc theo lớp học cụ thể (tuỳ chọn)"
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer",
      "default": 1
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer",
      "default": 10
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Danh sách feedbacks",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true,
          "data": {
            "feedbacks": [
              {
                "id": "fb-uuid-1",
                "rating": 5,
                "comment": "Rất tuyệt vời!",
                "isAnonymous": false,
                "member": {
                  "user": {
                    "fullName": "Trần Thị B"
                  }
                },
                "coach": {
                  "user": {
                    "fullName": "Nguyễn Văn A"
                  }
                },
                "class": {
                  "name": "Morning Yoga"
                }
              },
              {
                "id": "fb-uuid-2",
                "rating": 4,
                "comment": "Tốt",
                "isAnonymous": true,
                "isOwn": false
              }
            ],
            "summary": {
              "averageRating": 4.5,
              "totalFeedbacks": 12
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /feedbacks/my
Member xem danh sách feedback mình đã gửi

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Danh sách feedback của member",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true,
          "data": [
            {
              "id": "fb-uuid",
              "rating": 5,
              "comment": "HLV rất tốt!",
              "coach": {
                "user": {
                  "fullName": "Nguyễn Văn A"
                }
              }
            }
          ]
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## DELETE /feedbacks/{id}
Member xóa feedback của mình

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string",
      "format": "uuid"
    },
    "description": "Feedback ID"
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Xóa thành công",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true,
          "data": {
            "message": "Feedback đã được xóa thành công."
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## DELETE /feedbacks/{id}/manager
Manager xóa feedback vi phạm

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string",
      "format": "uuid"
    },
    "description": "Feedback ID"
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Xóa thành công",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true,
          "data": {
            "message": "Feedback đã được xóa bởi quản lý."
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /enrollments
Book a class (Member books own class; Manager book for a member)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "scheduleId"
  ],
  "properties": {
    "scheduleId": {
      "type": "string",
      "format": "uuid"
    },
    "memberId": {
      "type": "string",
      "format": "uuid",
      "description": "Required when booked by Manager"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Class booked successfully",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Class booked successfully",
            "data": {
              "id": "6b6b6b6b-0000-4000-8000-000000000201",
              "status": "BOOKED",
              "bookedAt": "2026-09-12T08:00:00.000Z",
              "schedule": {
                "startTime": "2026-09-15T07:00:00.000Z",
                "endTime": "2026-09-15T08:00:00.000Z",
                "class": {
                  "name": "Morning Yoga"
                },
                "room": {
                  "name": "Yoga Room A"
                }
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Forbidden — one of:\n- No active membership\n- Membership expires before class date\n- PREMIUM class requires PREMIUM plan\n- Concurrent-class quota exceeded (`MembershipPlan.maxConcurrentClasses`)\n- Member đang bị hình phạt chuyên cần ở Class này\n",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "examples": {
          "no_membership": {
            "summary": "No active membership",
            "value": {
              "success": false,
              "message": "Bạn không có gói tập đang hoạt động. Vui lòng mua gói để đặt lịch."
            }
          },
          "plan_expires_before_class": {
            "summary": "Plan expires before class",
            "value": {
              "success": false,
              "message": "Gói tập của bạn sẽ hết hạn ngày 25/09/2026, trước khi lớp học diễn ra ngày 30/09/2026. Vui lòng gia hạn gói để đặt lịch."
            }
          },
          "premium_required": {
            "summary": "PREMIUM class requires PREMIUM plan",
            "value": {
              "success": false,
              "message": "Premium membership required to book this class."
            }
          },
          "concurrent_class_limit_reached": {
            "summary": "Vượt quota lớp học song song (distinct Class)",
            "value": {
              "success": false,
              "message": "Bạn đã đạt giới hạn 3 lớp học song song của gói MEMBERSHIP. Vui lòng hủy hoặc chuyển một lớp đang đặt trước khi đăng ký lớp mới.",
              "errors": {
                "code": "CONCURRENT_CLASS_LIMIT_REACHED",
                "tier": "MEMBERSHIP",
                "limit": 3,
                "used": 3,
                "remaining": 0
              }
            }
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /enrollments/my
Get current member's enrollments

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "BOOKED",
        "CANCELLED",
        "COMPLETED"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated list of enrollments (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Enrollments retrieved successfully",
            "data": [
              {
                "id": "6b6b6b6b-0000-4000-8000-000000000201",
                "status": "BOOKED",
                "bookedAt": "2026-09-12T08:00:00.000Z",
                "member": {
                  "user": {
                    "fullName": "John Doe",
                    "email": "member1@example.com"
                  }
                },
                "schedule": {
                  "startTime": "2026-09-15T07:00:00.000Z",
                  "class": {
                    "name": "Morning Yoga"
                  }
                }
              }
            ],
            "pagination": {
              "page": 1,
              "limit": 10,
              "total": 1,
              "totalPages": 1
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /enrollments/my/courses
My courses — in-payment / ongoing at the top, purchase history below (Member only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "group",
    "schema": {
      "type": "string",
      "enum": [
        "active",
        "history"
      ]
    }
  },
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string"
    },
    "example": "ONGOING,UPCOMING"
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /enrollments/my/quota
Get my concurrent-class quota (Member only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Quota lớp học song song của chính member đang đăng nhập. `used` = số Class KHÁC NHAU (DISTINCT Class, KHÔNG phải số Schedule) đang có Enrollment BOOKED ở buổi SCHEDULED chưa bắt đầu; `remaining = max(0, limit - used)` với `limit = MembershipPlan.maxConcurrentClasses` của gói ACTIVE. `hasActiveSubscription = true` + `tier` = tier gói khi member có MembershipSubscription ACTIVE (member mới được auto-provision gói FREE nên tier = FREE, limit = 0). Nếu member KHÔNG có subscription ACTIVE: `hasActiveSubscription = false`, `tier = null`, `limit = 0`, `remaining = 0` — KHÔNG dùng tier FREE để đại diện cho trường hợp thiếu subscription. `classes[]` có đúng MỘT entry cho mỗi DISTINCT Class; `futureBookedScheduleCount` là số buổi tương lai đang BOOKED của Class đó và `scheduleId`/`scheduleStartTime`/`enrollmentId` chỉ là buổi ĐẠI DIỆN (gần nhất), không phải toàn bộ buổi.",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Concurrent class quota retrieved successfully",
            "data": {
              "hasActiveSubscription": true,
              "tier": "MEMBERSHIP",
              "limit": 3,
              "used": 2,
              "remaining": 1,
              "classes": [
                {
                  "classId": "class-1",
                  "className": "Yoga Beginner",
                  "futureBookedScheduleCount": 2,
                  "scheduleId": "schedule-1",
                  "scheduleStartTime": "2026-09-25T18:00:00.000Z",
                  "enrollmentId": "enrollment-1"
                },
                {
                  "classId": "class-2",
                  "className": "Boxing Basic",
                  "futureBookedScheduleCount": 1,
                  "scheduleId": "schedule-2",
                  "scheduleStartTime": "2026-09-26T09:00:00.000Z",
                  "enrollmentId": "enrollment-2"
                }
              ]
            }
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /enrollments/bulk
Enroll in a WHOLE course (all upcoming sessions of a class) — Member self-enrolls; Manager for a member

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "classId"
  ],
  "properties": {
    "classId": {
      "type": "string",
      "format": "uuid"
    },
    "memberId": {
      "type": "string",
      "description": "Required when enrolled by Manager (nhận cả userId hoặc MemberProfile.id)"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Class booked successfully",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Class booked successfully",
            "data": {
              "id": "6b6b6b6b-0000-4000-8000-000000000201",
              "status": "BOOKED",
              "bookedAt": "2026-09-12T08:00:00.000Z",
              "schedule": {
                "startTime": "2026-09-15T07:00:00.000Z",
                "endTime": "2026-09-15T08:00:00.000Z",
                "class": {
                  "name": "Morning Yoga"
                },
                "room": {
                  "name": "Yoga Room A"
                }
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Một hoặc nhiều buổi không đủ điều kiện (all-or-nothing — không buổi nào được tạo)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "examples": {
          "session_full": {
            "summary": "Một buổi trong khóa đã hết chỗ",
            "value": {
              "success": false,
              "message": "Không thể đăng ký trọn khóa \"Yoga sáng\": 1 điều kiện chưa đạt.",
              "errors": {
                "code": "COURSE_ENROLLMENT_FAILED",
                "classId": "a1b2c3d4-0000-0000-0000-000000000010",
                "className": "Yoga sáng",
                "totalSessions": 12,
                "failedCount": 1,
                "details": [
                  {
                    "code": "SESSION_FULL",
                    "message": "Buổi 18:00 05/10/2026 (Phòng Yoga 1) đã hết chỗ.",
                    "sessionId": "b2c3d4e5-0000-0000-0000-000000000005",
                    "roomName": "Phòng Yoga 1",
                    "details": {
                      "bookedCount": 20,
                      "capacity": 20
                    }
                  }
                ]
              }
            }
          },
          "subscription_expires": {
            "summary": "Gói tập hết hạn trước buổi cuối của khóa",
            "value": {
              "success": false,
              "message": "Không thể đăng ký trọn khóa \"Yoga sáng\": 1 điều kiện chưa đạt.",
              "errors": {
                "code": "COURSE_ENROLLMENT_FAILED",
                "failedCount": 1,
                "details": [
                  {
                    "code": "SUBSCRIPTION_ENDS_BEFORE_COURSE_END",
                    "message": "Gói tập của bạn hết hạn ngày 20/10/2026, trước buổi cuối của khóa ngày 19/11/2026. Vui lòng gia hạn gói để đăng ký trọn khóa.",
                    "details": {
                      "planEndDate": "2026-10-20T00:00:00.000Z",
                      "lastSessionStartTime": "2026-11-19T01:00:00.000Z",
                      "coveredSessions": 6,
                      "totalSessions": 12
                    }
                  }
                ]
              }
            }
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /enrollments/schedule/{scheduleId}
Get all enrollments for a schedule

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "scheduleId",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "BOOKED",
        "CANCELLED",
        "COMPLETED"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated list of enrollments (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Enrollments retrieved successfully",
            "data": [
              {
                "id": "6b6b6b6b-0000-4000-8000-000000000201",
                "status": "BOOKED",
                "bookedAt": "2026-09-12T08:00:00.000Z",
                "member": {
                  "user": {
                    "fullName": "John Doe",
                    "email": "member1@example.com"
                  }
                },
                "schedule": {
                  "startTime": "2026-09-15T07:00:00.000Z",
                  "class": {
                    "name": "Morning Yoga"
                  }
                }
              }
            ],
            "pagination": {
              "page": 1,
              "limit": 10,
              "total": 1,
              "totalPages": 1
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /enrollments/{id}/transfer-options
Buổi có thể đổi sang (cùng khóa hoặc khóa tương đương cùng HLV, cùng hạng) + số lần đổi còn lại

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "date",
    "schema": {
      "type": "string"
    },
    "example": "2026-10-20"
  },
  {
    "in": "query",
    "name": "weekday",
    "schema": {
      "type": "integer",
      "minimum": 1,
      "maximum": 7
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## DELETE /enrollments/{id}
Cancel an enrollment (Member cancelling ≥24h before start → 80% session refund request)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single enrollment",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Enrollment retrieved successfully",
            "data": {
              "id": "6b6b6b6b-0000-4000-8000-000000000201",
              "status": "BOOKED",
              "bookedAt": "2026-09-12T08:00:00.000Z",
              "schedule": {
                "startTime": "2026-09-15T07:00:00.000Z",
                "endTime": "2026-09-15T08:00:00.000Z",
                "class": {
                  "name": "Morning Yoga"
                },
                "room": {
                  "name": "Yoga Room A"
                }
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /enrollments/{id}/transfer
Move a booking to another schedule (Member moves own booking; Manager any member)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "Enrollment ID của chỗ đặt hiện tại"
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "targetScheduleId"
  ],
  "properties": {
    "targetScheduleId": {
      "type": "string",
      "format": "uuid",
      "description": "ClassSchedule.id của buổi muốn chuyển tới"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single enrollment",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Enrollment retrieved successfully",
            "data": {
              "id": "6b6b6b6b-0000-4000-8000-000000000201",
              "status": "BOOKED",
              "bookedAt": "2026-09-12T08:00:00.000Z",
              "schedule": {
                "startTime": "2026-09-15T07:00:00.000Z",
                "endTime": "2026-09-15T08:00:00.000Z",
                "class": {
                  "name": "Morning Yoga"
                },
                "room": {
                  "name": "Yoga Room A"
                }
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /coaches
List all coaches

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    },
    "description": "Page number"
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    },
    "description": "Items per page"
  },
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    },
    "description": "Search by name or email"
  },
  {
    "in": "query",
    "name": "specialization",
    "schema": {
      "type": "string"
    },
    "description": "Filter by specialization (partial match)"
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated list of coaches (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Coaches retrieved successfully",
            "data": [
              {
                "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
                "email": "coach1@sportscenter.com",
                "fullName": "Coach One",
                "phone": "0900000003",
                "role": "COACH",
                "isActive": true,
                "coachProfile": {
                  "specialization": "Yoga, Pilates",
                  "experienceYears": 5
                }
              }
            ],
            "pagination": {
              "page": 1,
              "limit": 10,
              "total": 2,
              "totalPages": 1
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /coaches/me/wallet
Coach xem ví của chính mình

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Thông tin ví"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /coaches/me/wallet/transactions
Coach xem lịch sử giao dịch ví

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Danh sách giao dịch"
  }
}
```

## POST /coaches/me/wallet/withdraw
Coach yêu cầu rút tiền (chỉ khi tất cả class đã COMPLETED)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "amount",
    "bankInfo"
  ],
  "properties": {
    "amount": {
      "type": "number",
      "description": "Số tiền muốn rút (VND)"
    },
    "bankInfo": {
      "type": "object",
      "description": "Thông tin ngân hàng nhận tiền",
      "properties": {
        "bankName": {
          "type": "string"
        },
        "accountNumber": {
          "type": "string"
        },
        "accountName": {
          "type": "string"
        }
      }
    },
    "note": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Yêu cầu rút tiền đã được gửi, chờ Manager duyệt"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "409": {
    "description": "Đang có yêu cầu rút tiền PENDING chưa xử lý"
  }
}
```

## PATCH /coaches/wallet/transactions/{txId}/review
Manager duyệt hoặc từ chối yêu cầu rút tiền của Coach

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "txId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "action"
  ],
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "APPROVE",
        "REJECT"
      ]
    },
    "reason": {
      "type": "string",
      "maxLength": 500
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Yêu cầu đã được xử lý"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /coaches/wallet/transactions
BE-7: MANAGER liệt kê lệnh rút tiền (kèm HLV, số dư & tiền tạm giữ của ví)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "type",
    "schema": {
      "type": "string",
      "enum": [
        "WITHDRAWAL",
        "DEPOSIT",
        "REFUND_DEBIT",
        "CHECKIN_FEE"
      ],
      "default": "WITHDRAWAL"
    }
  },
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "PENDING",
        "COMPLETED",
        "REJECTED",
        "FAILED"
      ]
    }
  },
  {
    "in": "query",
    "name": "coachId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "[{ id, amount, status, bankInfo, note, rejectReason, createdAt, coach, wallet: { balance, pendingRefundDebit, available } }]"
  }
}
```

## GET /coaches/wallet/transactions/{txId}
BE-7: MANAGER xem chi tiết lệnh rút tiền

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Lệnh rút + coach + wallet"
  },
  "404": {
    "description": "Không tìm thấy"
  }
}
```

## GET /coaches/me/students/{memberId}
BE-19: Hồ sơ học viên trong các khóa của tôi + chuyên cần từng khóa + lộ trình

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ member, attendedCount, pastSessionCount, classes[], plans[] }"
  },
  "403": {
    "description": "Học viên không thuộc khóa của tôi"
  }
}
```

## GET /coaches/cv/pending
Manager lấy danh sách hồ sơ CV theo trạng thái (mặc định PENDING)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "PENDING",
        "APPROVED",
        "REJECTED"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  }
}
```

## GET /coaches/{id}
Get coach by ID

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "Coach user ID"
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Coach details with assigned classes",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Coach retrieved successfully",
            "data": {
              "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
              "email": "coach1@sportscenter.com",
              "fullName": "Coach One",
              "phone": "0900000003",
              "role": "COACH",
              "isActive": true,
              "coachProfile": {
                "specialization": "Yoga, Pilates",
                "experienceYears": 5,
                "bio": "Yoga instructor",
                "classes": [
                  {
                    "id": "class-yoga-001",
                    "name": "Morning Yoga",
                    "schedules": []
                  }
                ]
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /coaches/{id}
Update coach profile (Manager update any; Coach updates own profile)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "Coach user ID"
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "fullName": {
      "type": "string"
    },
    "phone": {
      "type": "string"
    },
    "gender": {
      "type": "string",
      "enum": [
        "MALE",
        "FEMALE",
        "OTHER"
      ]
    },
    "dateOfBirth": {
      "type": "string"
    },
    "specialization": {
      "type": "string"
    },
    "experienceYears": {
      "type": "integer"
    },
    "bio": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Coach details with assigned classes",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Coach retrieved successfully",
            "data": {
              "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
              "email": "coach1@sportscenter.com",
              "fullName": "Coach One",
              "phone": "0900000003",
              "role": "COACH",
              "isActive": true,
              "coachProfile": {
                "specialization": "Yoga, Pilates",
                "experienceYears": 5,
                "bio": "Yoga instructor",
                "classes": [
                  {
                    "id": "class-yoga-001",
                    "name": "Morning Yoga",
                    "schedules": []
                  }
                ]
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /coaches/{id}/profile
Hồ sơ CÔNG KHAI của HLV (bảng thông tin ở chi tiết khóa học) — công khai

Authentication: []

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## GET /coaches/{id}/upcoming-sessions
Upcoming sessions of a coach (for the coach info panel in course detail)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "Coach user ID"
  },
  {
    "in": "query",
    "name": "classId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer"
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## POST /coaches/me/cv
Coach nộp CV (PDF)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  }
}
```

## PATCH /coaches/{profileId}/cv/review
Manager duyệt hoặc từ chối CV của Coach

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "profileId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "action"
  ],
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "APPROVE",
        "REJECT"
      ]
    },
    "reason": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  }
}
```

## GET /coaches/{profileId}/cv/file
BE-8: Tải file CV (PDF) — MANAGER hoặc chính HLV

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "application/pdf"
  },
  "403": {
    "description": "Không có quyền"
  },
  "404": {
    "description": "Chưa nộp CV / không còn file"
  }
}
```

## GET /classes
Get list of classes

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    },
    "description": "Search by class name"
  },
  {
    "in": "query",
    "name": "fitness",
    "schema": {
      "type": "string"
    },
    "description": "Lọc theo môn tập (không phân biệt hoa/thường, khớp đúng tên môn)"
  },
  {
    "in": "query",
    "name": "goal",
    "schema": {
      "type": "string"
    },
    "description": "Lọc theo 1 mục tiêu (mã trong GET /classes/goal-options)"
  },
  {
    "in": "query",
    "name": "matchMyGoals",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false"
      ]
    },
    "description": "MEMBER: chỉ khóa khớp ≥ 1 mục tiêu của tôi, sắp theo độ phù hợp. Mỗi khóa kèm `goalMatch` khi người gọi là MEMBER."
  },
  {
    "in": "query",
    "name": "classType",
    "schema": {
      "type": "string",
      "enum": [
        "REGULAR",
        "PREMIUM"
      ]
    },
    "description": "Filter by class tier (REGULAR | PREMIUM)"
  },
  {
    "in": "query",
    "name": "areaType",
    "schema": {
      "type": "string",
      "enum": [
        "POOL",
        "INDOOR",
        "OUTDOOR"
      ]
    },
    "description": "Filter by area type (POOL | INDOOR | OUTDOOR)"
  },
  {
    "in": "query",
    "name": "coachId",
    "schema": {
      "type": "string"
    },
    "description": "Filter by coach (CoachProfile.id)"
  },
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "DRAFT",
        "PENDING",
        "APPROVED",
        "REJECTED",
        "COMPLETED"
      ]
    },
    "description": "Filter by approval status (Guest luôn chỉ thấy APPROVED; DRAFT chỉ HLV chủ khóa thấy)"
  },
  {
    "in": "query",
    "name": "isActive",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false"
      ]
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer",
      "default": 1
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer",
      "default": 10
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated list of classes (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Classes retrieved successfully",
            "data": [
              {
                "id": "class-yoga-001",
                "name": "Morning Yoga",
                "description": "Gentle yoga class",
                "capacity": 15,
                "classType": "REGULAR",
                "areaType": "INDOOR",
                "isActive": true,
                "coach": {
                  "id": "coach-profile-1",
                  "user": {
                    "fullName": "Coach One"
                  }
                },
                "_count": {
                  "enrollments": 3,
                  "schedules": 2
                }
              }
            ],
            "pagination": {
              "page": 1,
              "limit": 10,
              "total": 3,
              "totalPages": 1
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /classes
Coach tạo lớp học mới (chờ Manager duyệt)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "name",
    "fitness",
    "capacity",
    "areaType"
  ],
  "properties": {
    "name": {
      "type": "string",
      "example": "Morning Yoga"
    },
    "fitness": {
      "type": "string",
      "example": "Yoga",
      "description": "Môn tập của lớp (Yoga, HIIT, Bơi...). Nhập tự do, 2-60 ký tự."
    },
    "description": {
      "type": "string"
    },
    "goal": {
      "type": "string",
      "maxLength": 1000,
      "example": "Giảm 3-5kg sau 8 tuần, cải thiện sức bền",
      "description": "Mục tiêu của lớp để Member xem và tự đánh giá trước khi enroll (tùy chọn)."
    },
    "capacity": {
      "type": "integer",
      "example": 20
    },
    "classType": {
      "type": "string",
      "enum": [
        "REGULAR",
        "PREMIUM"
      ],
      "default": "REGULAR",
      "description": "Class tier (REGULAR | PREMIUM). Different from areaType."
    },
    "areaType": {
      "type": "string",
      "enum": [
        "POOL",
        "INDOOR",
        "OUTDOOR"
      ],
      "example": "INDOOR",
      "description": "Area type required by this class (phải khớp areaType của phòng khi xếp lịch)."
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Class created",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Class created successfully",
            "data": {
              "id": "class-boxing-001",
              "name": "Boxing Basics",
              "capacity": 12,
              "classType": "REGULAR",
              "areaType": "INDOOR"
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /classes/fitness
BE-11: Danh mục bộ môn (distinct Class.fitness của khóa đã duyệt) — công khai

Authentication: []

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "data: string[]"
  }
}
```

## GET /classes/goal-options
Danh mục mục tiêu tập luyện (công khai) — Coach gắn cho khóa, Member chọn cho hồ sơ

Authentication: []

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "[{ code, label, description }]"
  }
}
```

## POST /classes/drafts
COACH tạo bản nháp khóa học (wizard tự lưu) — status DRAFT, chưa giữ phòng/tạo buổi

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "goal": {
      "type": "string"
    },
    "goalTags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "targetLevel": {
      "type": "string",
      "enum": [
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED"
      ]
    },
    "capacity": {
      "type": "integer"
    },
    "classType": {
      "type": "string",
      "enum": [
        "REGULAR",
        "PREMIUM"
      ]
    },
    "price": {
      "type": "number"
    },
    "draftData": {
      "type": "object",
      "description": "Toàn bộ trạng thái wizard (client tự định nghĩa)"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Bản nháp (Class)"
  },
  "409": {
    "description": "DRAFT_LIMIT — tối đa 10 bản nháp"
  }
}
```

## PATCH /classes/drafts/{id}
COACH tự lưu bản nháp (ghi đè field được gửi)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "description": "Giống POST /classes/drafts"
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Bản nháp đã lưu"
  },
  "404": {
    "description": "DRAFT_NOT_FOUND"
  },
  "409": {
    "description": "CLASS_NOT_DRAFT"
  }
}
```

## DELETE /classes/drafts/{id}
COACH xóa bản nháp

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ id, deleted: true }"
  }
}
```

## POST /classes/drafts/{id}/submit
COACH gửi duyệt bản nháp ⇒ PENDING (kiểm tra đủ, giữ phòng, tạo buổi)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "description": "Giống body POST /class-schedules/activity-plan: { class (bắt buộc goalTags ≥ 1), roomId, schedules[] | recurrence }"
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ class, schedulesCreated, startDate, endDate, totalSessions, status: PENDING }"
  },
  "400": {
    "description": "CLASS_GOALS_REQUIRED / validate"
  },
  "409": {
    "description": "ROOM_CONFLICT / COACH_CONFLICT / CLASS_NOT_DRAFT"
  }
}
```

## POST /classes/maintenance
MANAGER — chạy ngay job bảo trì khóa học (cũng chạy định kỳ 5 phút ở server)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "OK"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /classes/{id}
View class details (includes coaches and upcoming schedules)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single class with its coach and upcoming schedules",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Class retrieved successfully",
            "data": {
              "id": "class-yoga-001",
              "name": "Morning Yoga",
              "capacity": 15,
              "classType": "REGULAR",
              "areaType": "INDOOR",
              "isActive": true,
              "coach": {
                "id": "coach-profile-1",
                "user": {
                  "fullName": "Coach One"
                }
              },
              "schedules": []
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /classes/{id}
Update class

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "fitness": {
      "type": "string",
      "description": "Môn tập của lớp (2-60 ký tự)."
    },
    "description": {
      "type": "string"
    },
    "goal": {
      "type": "string",
      "maxLength": 1000,
      "example": "Giảm 3-5kg sau 8 tuần, cải thiện sức bền",
      "description": "Mục tiêu của lớp để Member xem và tự đánh giá trước khi enroll (tùy chọn)."
    },
    "capacity": {
      "type": "integer"
    },
    "classType": {
      "type": "string",
      "enum": [
        "REGULAR",
        "PREMIUM"
      ]
    },
    "areaType": {
      "type": "string",
      "enum": [
        "POOL",
        "INDOOR",
        "OUTDOOR"
      ],
      "description": "New area type. Upcoming schedules must use a matching Room."
    },
    "isActive": {
      "type": "boolean"
    },
    "price": {
      "type": "number",
      "minimum": 0,
      "description": "Giá áp dụng cho giao dịch MỚI — Payment đã tạo giữ nguyên số tiền."
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single class with its coach and upcoming schedules",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Class retrieved successfully",
            "data": {
              "id": "class-yoga-001",
              "name": "Morning Yoga",
              "capacity": 15,
              "classType": "REGULAR",
              "areaType": "INDOOR",
              "isActive": true,
              "coach": {
                "id": "coach-profile-1",
                "user": {
                  "fullName": "Coach One"
                }
              },
              "schedules": []
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## DELETE /classes/{id}
Deactivate class (soft delete)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single class with its coach and upcoming schedules",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Class retrieved successfully",
            "data": {
              "id": "class-yoga-001",
              "name": "Morning Yoga",
              "capacity": 15,
              "classType": "REGULAR",
              "areaType": "INDOOR",
              "isActive": true,
              "coach": {
                "id": "coach-profile-1",
                "user": {
                  "fullName": "Coach One"
                }
              },
              "schedules": []
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /classes/{id}/course-plan
View a class as ONE course (grouped recurring timetable) + whole-course enrollment eligibility

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "Class ID"
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single class with its coach and upcoming schedules",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Class retrieved successfully",
            "data": {
              "id": "class-yoga-001",
              "name": "Morning Yoga",
              "capacity": 15,
              "classType": "REGULAR",
              "areaType": "INDOOR",
              "isActive": true,
              "coach": {
                "id": "coach-profile-1",
                "user": {
                  "fullName": "Coach One"
                }
              },
              "schedules": []
            }
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /classes/{id}/students
L12: Học viên của khóa + chuyên cần + doanh thu thật (COACH chủ khóa / MANAGER)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ students[], grossRevenue, refundedAmount, coachRevenue }"
  },
  "403": {
    "description": "Không phải khóa của mình"
  }
}
```

## PATCH /classes/{id}/review
Manager duyệt hoặc từ chối class do Coach tạo (PENDING → APPROVED/REJECTED)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "action"
  ],
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "APPROVE",
        "REJECT"
      ]
    },
    "reason": {
      "type": "string",
      "maxLength": 500,
      "description": "Lý do từ chối (tùy chọn)"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single class with its coach and upcoming schedules",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Class retrieved successfully",
            "data": {
              "id": "class-yoga-001",
              "name": "Morning Yoga",
              "capacity": 15,
              "classType": "REGULAR",
              "areaType": "INDOOR",
              "isActive": true,
              "coach": {
                "id": "coach-profile-1",
                "user": {
                  "fullName": "Coach One"
                }
              },
              "schedules": []
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /classes/{id}/resubmit
BE-3: Coach sửa & gửi lại khóa PENDING/REJECTED (kèm lịch) ⇒ PENDING

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "description": "Giống body POST /class-schedules/activity-plan: { class, roomId, schedules[] } hoặc { class, roomId, recurrence }"
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ class, schedulesCreated, startDate, endDate, totalSessions, status: PENDING }"
  },
  "400": {
    "description": "Khóa không ở trạng thái PENDING/REJECTED"
  },
  "403": {
    "description": "Không phải HLV của khóa"
  },
  "409": {
    "description": "ROOM_CONFLICT / COACH_CONFLICT"
  }
}
```

## POST /class-schedules/activity-plan
Coach tạo nhanh lớp học (có phòng) — lớp PENDING chờ Manager duyệt

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object"
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Schedule created",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Schedule created successfully",
            "data": {
              "id": "sch-yoga-001",
              "startTime": "2026-09-15T07:00:00.000Z",
              "endTime": "2026-09-15T08:00:00.000Z",
              "status": "SCHEDULED",
              "class": {
                "name": "Morning Yoga",
                "areaType": "INDOOR"
              },
              "room": {
                "name": "Yoga Room A",
                "areaType": "INDOOR"
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  }
}
```

## GET /class-schedules
Get list of schedules

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "classId",
    "schema": {
      "type": "string"
    },
    "description": "Filter by class"
  },
  {
    "in": "query",
    "name": "roomId",
    "schema": {
      "type": "string"
    },
    "description": "Filter by room"
  },
  {
    "in": "query",
    "name": "coachId",
    "schema": {
      "type": "string"
    },
    "description": "Filter by coach (CoachProfile.id)"
  },
  {
    "in": "query",
    "name": "mine",
    "schema": {
      "type": "string",
      "enum": [
        "true",
        "false"
      ]
    },
    "description": "Chỉ buổi của tôi (COACH: khóa mình dạy; MEMBER: buổi mình giữ chỗ)"
  },
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "SCHEDULED",
        "CANCELLED",
        "COMPLETED"
      ]
    }
  },
  {
    "in": "query",
    "name": "weekday",
    "schema": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "style": "form",
    "explode": true,
    "description": "Lọc 1 thứ: 2=T2..7=T7, 8=CN (alias: T2..T7, MON..SUN, Thứ 2..Chủ nhật). Lặp lại param để chọn nhiều thứ. VD: ?weekday=2&weekday=CN",
    "example": "2"
  },
  {
    "in": "query",
    "name": "weekdays",
    "schema": {
      "type": "string"
    },
    "description": "Lọc nhiều thứ, phân tách dấu phẩy. VD: ?weekdays=2,4,8 hoặc ?weekdays=T2,T4,CN. Hợp nhất với weekday.",
    "example": "2,4,8"
  },
  {
    "in": "query",
    "name": "date",
    "schema": {
      "type": "string",
      "example": "2026-09-15"
    },
    "description": "Filter by date (YYYY-MM-DD)"
  },
  {
    "in": "query",
    "name": "startAfter",
    "schema": {
      "type": "string",
      "format": "date-time"
    },
    "description": "Schedules starting after this time"
  },
  {
    "in": "query",
    "name": "startBefore",
    "schema": {
      "type": "string",
      "format": "date-time"
    },
    "description": "Schedules starting before this time (legacy start-time filtering)"
  },
  {
    "in": "query",
    "name": "from",
    "schema": {
      "type": "string",
      "format": "date-time"
    },
    "description": "Overlap-range filter start (schedule.endTime > from)"
  },
  {
    "in": "query",
    "name": "to",
    "schema": {
      "type": "string",
      "format": "date-time"
    },
    "description": "Overlap-range filter end (schedule.startTime < to)"
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer",
      "default": 1
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer",
      "default": 10
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated list of schedules (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Schedules retrieved successfully",
            "data": [
              {
                "id": "sch-yoga-001",
                "startTime": "2026-09-15T07:00:00.000Z",
                "endTime": "2026-09-15T08:00:00.000Z",
                "status": "SCHEDULED",
                "class": {
                  "name": "Morning Yoga",
                  "areaType": "INDOOR"
                },
                "room": {
                  "name": "Yoga Room A",
                  "areaType": "INDOOR"
                },
                "_count": {
                  "enrollments": 2
                }
              }
            ],
            "pagination": {
              "page": 1,
              "limit": 10,
              "total": 3,
              "totalPages": 1
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /class-schedules
Create a new schedule (checks area type, room & coach conflicts)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "classId",
    "roomId",
    "startTime",
    "endTime"
  ],
  "properties": {
    "classId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "startTime": {
      "type": "string",
      "format": "date-time",
      "example": "2026-09-15T07:00:00+07:00"
    },
    "endTime": {
      "type": "string",
      "format": "date-time",
      "example": "2026-09-15T08:00:00+07:00"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Schedule created",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Schedule created successfully",
            "data": {
              "id": "sch-yoga-001",
              "startTime": "2026-09-15T07:00:00.000Z",
              "endTime": "2026-09-15T08:00:00.000Z",
              "status": "SCHEDULED",
              "class": {
                "name": "Morning Yoga",
                "areaType": "INDOOR"
              },
              "room": {
                "name": "Yoga Room A",
                "areaType": "INDOOR"
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /class-schedules/{id}
View schedule details (including enrolled count)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single schedule with class/room and enrolled count",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Schedule retrieved successfully",
            "data": {
              "id": "sch-yoga-001",
              "startTime": "2026-09-15T07:00:00.000Z",
              "endTime": "2026-09-15T08:00:00.000Z",
              "status": "SCHEDULED",
              "class": {
                "name": "Morning Yoga",
                "areaType": "INDOOR",
                "coach": {
                  "user": {
                    "fullName": "Coach One"
                  }
                }
              },
              "room": {
                "name": "Yoga Room A",
                "areaType": "INDOOR"
              },
              "_count": {
                "enrollments": 2
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /class-schedules/{id}
Update schedule (re-checks conflicts if room/time changed)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "roomId": {
      "type": "string"
    },
    "startTime": {
      "type": "string",
      "format": "date-time"
    },
    "endTime": {
      "type": "string",
      "format": "date-time"
    },
    "status": {
      "type": "string",
      "enum": [
        "SCHEDULED",
        "CANCELLED"
      ],
      "description": "CANCELLED chỉ dùng được khi buổi CHƯA có ai đặt chỗ; buổi đã có người đặt phải hủy qua POST /class-schedules/{id}/cancel (dạy bù / hoàn tiền), nếu không ⇒ 400 SCHEDULE_CANCEL_RESOLUTION_REQUIRED. COMPLETED must use /complete."
    },
    "reason": {
      "type": "string",
      "maxLength": 500,
      "description": "Cancellation reason (used in SCHEDULE_CANCELLED notification)"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single schedule with class/room and enrolled count",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Schedule retrieved successfully",
            "data": {
              "id": "sch-yoga-001",
              "startTime": "2026-09-15T07:00:00.000Z",
              "endTime": "2026-09-15T08:00:00.000Z",
              "status": "SCHEDULED",
              "class": {
                "name": "Morning Yoga",
                "areaType": "INDOOR",
                "coach": {
                  "user": {
                    "fullName": "Coach One"
                  }
                }
              },
              "room": {
                "name": "Yoga Room A",
                "areaType": "INDOOR"
              },
              "_count": {
                "enrollments": 2
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## DELETE /class-schedules/{id}
Cancel a schedule that has NO bookings

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single schedule with class/room and enrolled count",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Schedule retrieved successfully",
            "data": {
              "id": "sch-yoga-001",
              "startTime": "2026-09-15T07:00:00.000Z",
              "endTime": "2026-09-15T08:00:00.000Z",
              "status": "SCHEDULED",
              "class": {
                "name": "Morning Yoga",
                "areaType": "INDOOR",
                "coach": {
                  "user": {
                    "fullName": "Coach One"
                  }
                }
              },
              "room": {
                "name": "Yoga Room A",
                "areaType": "INDOOR"
              },
              "_count": {
                "enrollments": 2
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /class-schedules/{id}/cancel
Hủy buổi học kèm DẠY BÙ hoặc HOÀN TIỀN cho hội viên đã đặt chỗ

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "reason": {
      "type": "string",
      "maxLength": 500
    },
    "resolution": {
      "type": "object",
      "required": [
        "mode"
      ],
      "properties": {
        "mode": {
          "type": "string",
          "enum": [
            "MAKEUP",
            "REFUND"
          ]
        },
        "startTime": {
          "type": "string",
          "format": "date-time",
          "description": "Bắt buộc với MAKEUP"
        },
        "endTime": {
          "type": "string",
          "format": "date-time",
          "description": "Bắt buộc với MAKEUP"
        },
        "roomId": {
          "type": "string",
          "description": "Tuỳ chọn với MAKEUP"
        }
      }
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đã hủy — trả về { schedule, makeup, refunds }"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /class-schedules/{id}/reschedule
COACH dời MỘT buổi sang ngày/giờ khác (thông báo học viên)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "startTime",
    "endTime",
    "reason"
  ],
  "properties": {
    "startTime": {
      "type": "string",
      "format": "date-time"
    },
    "endTime": {
      "type": "string",
      "format": "date-time"
    },
    "roomId": {
      "type": "string",
      "description": "Tùy chọn — đổi phòng cùng lúc"
    },
    "reason": {
      "type": "string",
      "minLength": 3,
      "maxLength": 500
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ schedule, affectedMembers, conflictedMembers[], rescheduleCount, remainingReschedules }"
  },
  "400": {
    "description": "RESCHEDULE_TOO_LATE / RESCHEDULE_NEW_TIME_TOO_SOON / RESCHEDULE_LIMIT / RESCHEDULE_NO_CHANGE"
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "409": {
    "description": "ROOM_CONFLICT / COACH_CONFLICT / SCHEDULE_STATE_CHANGED"
  }
}
```

## PATCH /class-schedules/{id}/complete
Mark a schedule as COMPLETED (only after endTime)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single schedule with class/room and enrolled count",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Schedule retrieved successfully",
            "data": {
              "id": "sch-yoga-001",
              "startTime": "2026-09-15T07:00:00.000Z",
              "endTime": "2026-09-15T08:00:00.000Z",
              "status": "SCHEDULED",
              "class": {
                "name": "Morning Yoga",
                "areaType": "INDOOR",
                "coach": {
                  "user": {
                    "fullName": "Coach One"
                  }
                }
              },
              "room": {
                "name": "Yoga Room A",
                "areaType": "INDOOR"
              },
              "_count": {
                "enrollments": 2
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /chat/contacts
Get eligible chat contacts

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Contacts retrieved successfully"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  }
}
```

## GET /chat/conversations
Get list of conversations

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Conversations retrieved successfully"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /chat/messages
Get chat messages

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "targetId",
    "schema": {
      "type": "string"
    },
    "description": "Optional ID of the user to get private messages with"
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Messages retrieved successfully"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## POST /chat/messages
Send a message

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "201": {
    "description": "Message sent successfully"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /chat/attachments/{id}
Tải file đính kèm của tin nhắn (yêu cầu đăng nhập + phân quyền)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "File stream"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  }
}
```

## PATCH /chat/messages/read
Mark messages as read

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "targetId": {
      "type": "string",
      "description": "ID of the sender whose messages are being read"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Messages marked as read successfully"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /chat/messages/unread-count
Get global unread message count

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Unread count retrieved successfully"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## GET /center
Thông tin trung tâm (công khai)

Authentication: []

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ id, name, address, mapUrl, mapLink, hotline, email, openingHours, parkingNote, description }"
  }
}
```

## PUT /center
MANAGER cập nhật thông tin trung tâm

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "name",
    "address"
  ],
  "properties": {
    "name": {
      "type": "string",
      "example": "Pulse Gym Center"
    },
    "address": {
      "type": "string",
      "example": "123 Nguyễn Văn Linh, Phường Tân Phong, TP. Hồ Chí Minh"
    },
    "mapUrl": {
      "type": "string",
      "example": "https://maps.app.goo.gl/abc"
    },
    "hotline": {
      "type": "string",
      "example": "0909123456"
    },
    "email": {
      "type": "string",
      "example": "lienhe@pulsegym.vn"
    },
    "openingHours": {
      "type": "string",
      "example": "05:30 – 22:00 hằng ngày"
    },
    "parkingNote": {
      "type": "string",
      "example": "Gửi xe máy miễn phí tại tầng hầm B1"
    },
    "description": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Đã cập nhật"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  }
}
```

## POST /auth/register
Register a new member account

Authentication: []

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "email",
    "password",
    "fullName"
  ],
  "properties": {
    "email": {
      "type": "string",
      "format": "email",
      "description": "Will be converted to lowercase"
    },
    "password": {
      "type": "string",
      "minLength": 6
    },
    "fullName": {
      "type": "string",
      "maxLength": 100
    },
    "phone": {
      "type": "string",
      "pattern": "^[0-9+]{9,15}$",
      "description": "Optional, 9-15 digits, can start with +"
    },
    "gender": {
      "type": "string",
      "enum": [
        "MALE",
        "FEMALE",
        "OTHER"
      ]
    },
    "dateOfBirth": {
      "type": "string",
      "format": "date",
      "description": "Must be in the past"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Registration successful, returns the created member account",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Registration successful",
            "data": {
              "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
              "email": "member@example.com",
              "fullName": "John Doe",
              "phone": "0900000001",
              "gender": "MALE",
              "dateOfBirth": "2005-06-27T17:00:00.000Z",
              "role": "MEMBER",
              "isActive": true,
              "memberProfile": {
                "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                "trainingLevel": "BEGINNER"
              }
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /auth/login
Login and receive access + refresh tokens

Authentication: []

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "email",
    "password"
  ],
  "properties": {
    "email": {
      "type": "string",
      "format": "email"
    },
    "password": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Login successful, returns access + refresh tokens",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Login successful",
            "data": {
              "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImIzMTFkZ...",
              "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImIzMTFkZ..."
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /auth/logout
Logout and revoke refresh token

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "refreshToken"
  ],
  "properties": {
    "refreshToken": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Simple confirmation (data is null)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Logged out successfully",
            "data": null
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /auth/refresh-token
Get a new access token using a refresh token

Authentication: []

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "refreshToken"
  ],
  "properties": {
    "refreshToken": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "New access token issued from a valid refresh token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Token refreshed successfully",
            "data": {
              "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImIzMTFkZ..."
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /auth/forgot-password
Request a password reset link (Token is returned in response for testing)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "email"
  ],
  "properties": {
    "email": {
      "type": "string",
      "format": "email"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Simple confirmation (data is null)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Logged out successfully",
            "data": null
          }
        }
      }
    }
  }
}
```

## PATCH /auth/reset-password
Đặt lại mật khẩu: { token, newPassword } (liên kết Web) HOẶC { email, otp, newPassword } (mã 6 số — Mobile)

Authentication: []

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "newPassword"
  ],
  "properties": {
    "token": {
      "type": "string"
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "otp": {
      "type": "string",
      "pattern": "^[0-9]{6}$"
    },
    "newPassword": {
      "type": "string",
      "minLength": 6
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Simple confirmation (data is null)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Logged out successfully",
            "data": null
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  }
}
```

## GET /auth/me
Get current user profile

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Current user profile (with role-specific profile)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Profile retrieved successfully",
            "data": {
              "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
              "email": "member@example.com",
              "fullName": "John Doe",
              "phone": "0900000001",
              "gender": "MALE",
              "dateOfBirth": "2005-06-27T17:00:00.000Z",
              "avatarUrl": "https://res.cloudinary.com/demo/image/upload/v1789050000/sports-center/avatars/b311dfe5-8575-4ed4-9efd-8bc81a149f14.jpg",
              "role": "MEMBER",
              "isActive": true,
              "createdAt": "2026-09-11T14:20:14.910Z",
              "memberProfile": {
                "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                "fitnessGoal": "Lose weight",
                "trainingLevel": "BEGINNER"
              },
              "coachProfile": null,
              "managerProfile": null
            }
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /auth/me
Update current user profile

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "fullName": {
      "type": "string",
      "maxLength": 100
    },
    "phone": {
      "type": "string",
      "pattern": "^[0-9+]{9,15}$",
      "description": "Optional, 9-15 digits, can start with +"
    },
    "gender": {
      "type": "string",
      "enum": [
        "MALE",
        "FEMALE",
        "OTHER"
      ]
    },
    "dateOfBirth": {
      "type": "string",
      "format": "date",
      "description": "Must be in the past"
    },
    "fitnessGoal": {
      "type": "string",
      "description": "Ghi chú mục tiêu tự do"
    },
    "fitnessGoals": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Mã mục tiêu từ GET /classes/goal-options (tối đa 5)"
    },
    "trainingLevel": {
      "type": "string",
      "enum": [
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED"
      ]
    },
    "trainingPreference": {
      "type": "string"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Current user profile (with role-specific profile)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Profile retrieved successfully",
            "data": {
              "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
              "email": "member@example.com",
              "fullName": "John Doe",
              "phone": "0900000001",
              "gender": "MALE",
              "dateOfBirth": "2005-06-27T17:00:00.000Z",
              "avatarUrl": "https://res.cloudinary.com/demo/image/upload/v1789050000/sports-center/avatars/b311dfe5-8575-4ed4-9efd-8bc81a149f14.jpg",
              "role": "MEMBER",
              "isActive": true,
              "createdAt": "2026-09-11T14:20:14.910Z",
              "memberProfile": {
                "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                "fitnessGoal": "Lose weight",
                "trainingLevel": "BEGINNER"
              },
              "coachProfile": null,
              "managerProfile": null
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /auth/me/avatar
Upload avatar image for the current user profile

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Current user profile (with role-specific profile)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Profile retrieved successfully",
            "data": {
              "id": "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
              "email": "member@example.com",
              "fullName": "John Doe",
              "phone": "0900000001",
              "gender": "MALE",
              "dateOfBirth": "2005-06-27T17:00:00.000Z",
              "avatarUrl": "https://res.cloudinary.com/demo/image/upload/v1789050000/sports-center/avatars/b311dfe5-8575-4ed4-9efd-8bc81a149f14.jpg",
              "role": "MEMBER",
              "isActive": true,
              "createdAt": "2026-09-11T14:20:14.910Z",
              "memberProfile": {
                "id": "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                "fitnessGoal": "Lose weight",
                "trainingLevel": "BEGINNER"
              },
              "coachProfile": null,
              "managerProfile": null
            }
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## PATCH /auth/me/change-password
Change current user password

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "currentPassword",
    "newPassword"
  ],
  "properties": {
    "currentPassword": {
      "type": "string"
    },
    "newPassword": {
      "type": "string",
      "minLength": 6
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Simple confirmation (data is null)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Logged out successfully",
            "data": null
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /attendance
Get attendance roster of a schedule (MANAGER: full roster; COACH: only own classes; MEMBER: only own records)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "scheduleId",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Success"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /attendance
Record attendance for a member in a schedule (COACH: own classes; MANAGER: any class)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "scheduleId": {
      "type": "string"
    },
    "memberId": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "PRESENT",
        "ABSENT",
        "LATE",
        "EXCUSED"
      ]
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Success"
  }
}
```

## PATCH /attendance/{id}
Update an attendance record

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "PRESENT",
        "ABSENT",
        "LATE",
        "EXCUSED"
      ]
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Success"
  }
}
```

## PUT /attendance/schedule/{scheduleId}
BE-18: Ghi điểm danh cả danh sách một buổi (COACH phụ trách / MANAGER) — 1 giao dịch

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "memberId": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "PRESENT",
              "ABSENT",
              "LATE",
              "EXCUSED"
            ]
          },
          "note": {
            "type": "string"
          }
        }
      }
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Roster điểm danh sau khi ghi"
  },
  "400": {
    "description": "MEMBER_NOT_ENROLLED / buổi đã hủy"
  }
}
```

## DELETE /attendance/qr/{scheduleId}
BE-18: Thu hồi mã dự phòng còn hiệu lực của buổi (QR JWT tự hết hạn theo TTL)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "{ revokedManualCodes, qrTokenTtlSeconds }"
  }
}
```

## POST /attendance/generate-qr
Generate a short-lived QR token + manual backup code for attendance (Coach/Manager only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "scheduleId"
  ],
  "properties": {
    "scheduleId": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "QR token + manual backup code generated",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true,
          "message": "QR token generated successfully",
          "data": {
            "qrToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
            "expiresIn": 600,
            "manualCode": "K7M2QP",
            "manualCodeExpiresIn": 90
          }
        }
      }
    }
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /attendance/scan-qr
Check in by QR token OR manual backup code (Member only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "additionalProperties": false,
  "description": "Chỉ gửi một trong hai: qrToken hoặc code",
  "properties": {
    "qrToken": {
      "type": "string",
      "description": "JWT token from QR code shown by Coach (khi quét QR)"
    },
    "code": {
      "type": "string",
      "minLength": 6,
      "maxLength": 6,
      "description": "Mã dự phòng 6 ký tự (A-HJ-NP-Z2-9) khi không quét được QR"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Marked as PRESENT successfully (note phân biệt QR vs mã dự phòng)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "example": {
          "success": true,
          "message": "Điểm danh thành công",
          "data": {
            "id": "att-uuid",
            "status": "PRESENT",
            "note": "Điểm danh bằng mã dự phòng (nhập tay)"
          }
        }
      }
    }
  },
  "400": {
    "description": "QR/code sai, hết hạn hoặc body sai cấu trúc",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "examples": {
          "qr_expired": {
            "summary": "QR expired",
            "value": {
              "success": false,
              "message": "Mã QR đã hết hạn. Yêu cầu HLV mở mã mới."
            }
          },
          "qr_invalid": {
            "summary": "QR invalid",
            "value": {
              "success": false,
              "message": "Mã QR không hợp lệ."
            }
          },
          "manual_code_invalid": {
            "summary": "Manual code wrong/expired/revoked",
            "value": {
              "success": false,
              "message": "Mã điểm danh không hợp lệ hoặc đã hết hạn."
            }
          },
          "both_credentials": {
            "summary": "Gửi cả qrToken và code (hoặc key lạ như scheduleId)",
            "value": {
              "success": false,
              "message": "Validation failed",
              "errors": [
                {
                  "field": "code",
                  "message": "Chỉ gửi một trong hai: qrToken hoặc code"
                }
              ]
            }
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Not enrolled or subscription expired",
    "content": {
      "application/json": {
        "schema": {
          "type": "object"
        },
        "examples": {
          "not_enrolled": {
            "summary": "Not enrolled",
            "value": {
              "success": false,
              "message": "Bạn chưa đặt chỗ cho lớp học này nên không thể điểm danh."
            }
          },
          "subscription_expired": {
            "summary": "Subscription expired at check-in time",
            "value": {
              "success": false,
              "message": "Gói tập của bạn đã hết hạn. Vui lòng gia hạn để có thể vào lớp học."
            }
          }
        }
      }
    }
  },
  "429": {
    "description": "Too many attempts (rate limited) — e.g. nhập sai mã điểm danh dự phòng quá nhiều lần",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Bạn đã nhập sai mã điểm danh quá nhiều lần. Vui lòng thử lại sau hoặc nhờ HLV điểm danh trực tiếp."
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /attendance/my
Get current member's own attendance history

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "PRESENT",
        "ABSENT",
        "LATE",
        "EXCUSED"
      ]
    }
  },
  {
    "in": "query",
    "name": "classId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer",
      "default": 1
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer",
      "default": 20
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated own attendance records",
    "content": {
      "application/json": {
        "example": {
          "success": true,
          "message": "Attendance retrieved successfully",
          "data": [
            {
              "id": "att-uuid",
              "memberId": "member-uuid",
              "scheduleId": "schedule-uuid",
              "status": "ABSENT",
              "note": "SYSTEM_NO_SHOW",
              "schedule": {
                "id": "schedule-uuid",
                "startTime": "2026-09-15T07:00:00+07:00",
                "status": "COMPLETED",
                "class": {
                  "id": "class-uuid",
                  "name": "Yoga cơ bản"
                }
              }
            }
          ],
          "pagination": {
            "page": 1,
            "limit": 20,
            "total": 1,
            "totalPages": 1
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /attendance/my/summary
Attendance rate per class for the current member + own penalties

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Attendance summary",
    "content": {
      "application/json": {
        "example": {
          "success": true,
          "message": "Attendance summary retrieved successfully",
          "data": {
            "memberId": "member-uuid",
            "memberName": "Nguyễn Văn A",
            "thresholds": {
              "minSample": 5,
              "warnBelow": 80,
              "releaseBelow": 70,
              "appealWindowHours": 72
            },
            "buckets": [
              {
                "memberId": "member-uuid",
                "memberName": "Nguyễn Văn A",
                "classId": "class-uuid",
                "className": "Yoga cơ bản",
                "sampleSize": 5,
                "presentCount": 3,
                "lateCount": 0,
                "absentCount": 0,
                "noShowCount": 2,
                "excusedCount": 0,
                "attendanceRate": 60,
                "status": "RELEASE"
              }
            ],
            "penalties": [
              {
                "id": "penalty-uuid",
                "classId": "class-uuid",
                "className": "Yoga cơ bản",
                "status": "APPLIED",
                "reason": "Chuyên cần 60% (5 buổi được tính) — dưới ngưỡng 70%.",
                "attendanceRate": 60,
                "sampleSize": 5,
                "releasedCount": 2,
                "blockedUntil": "2026-10-23T07:00:00+07:00",
                "canAppeal": true
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /attendance/warnings/scan
Scan attendance and send WARN notifications (Manager only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "classId": {
      "type": "string",
      "description": "Chỉ quét một lớp (bỏ trống = tất cả)"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Scan result: { checked, warnBuckets, sent, skippedDuplicate }"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## GET /attendance/penalties
List attendance penalties (Manager only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "query",
    "name": "status",
    "schema": {
      "type": "string",
      "enum": [
        "PENDING",
        "APPLIED",
        "REVOKED",
        "EXPIRED"
      ]
    }
  },
  {
    "in": "query",
    "name": "memberId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "classId",
    "schema": {
      "type": "string"
    }
  },
  {
    "in": "query",
    "name": "page",
    "schema": {
      "type": "integer",
      "default": 1
    }
  },
  {
    "in": "query",
    "name": "limit",
    "schema": {
      "type": "integer",
      "default": 20
    }
  }
]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Paginated penalties"
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /attendance/penalties/preview
Preview members eligible for attendance penalty (Manager only, read-only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
null
```
Responses/status codes:
```json
{
  "200": {
    "description": "Preview list",
    "content": {
      "application/json": {
        "example": {
          "success": true,
          "message": "Penalty preview generated",
          "data": {
            "totalPreviewed": 1,
            "items": [
              {
                "memberId": "member-uuid",
                "memberName": "Nguyễn Văn A",
                "classId": "class-uuid",
                "className": "Yoga cơ bản",
                "attendanceRate": 62.5,
                "sampleSize": 8,
                "futureBookedEnrollmentCount": 2,
                "reason": "Chuyên cần 62.5% (8 buổi được tính: 5 có mặt, 0 đi muộn, 2 vắng, 1 không điểm danh) — dưới ngưỡng 70%."
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /attendance/penalties/apply
Apply attendance penalty (Manager only, atomic transaction)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "memberId",
    "classId"
  ],
  "properties": {
    "memberId": {
      "type": "string",
      "description": "MemberProfile.id"
    },
    "classId": {
      "type": "string"
    },
    "reason": {
      "type": "string",
      "maxLength": 500,
      "description": "Bỏ trống sẽ dùng lý do hệ thống sinh"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Penalty applied (kèm releasedCount, releasedEnrollmentIds, blockedUntil)"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /attendance/penalties/{id}/appeal
Member appeals own penalty (within 72h window)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "required": [
    "reason"
  ],
  "properties": {
    "reason": {
      "type": "string",
      "minLength": 5,
      "maxLength": 1000
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Appeal recorded"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```

## POST /attendance/penalties/{id}/revoke
Revoke a penalty (Manager only)

Authentication: [{"BearerAuth":[]}]

Parameters:
```json
[
  {
    "in": "path",
    "name": "id",
    "required": true,
    "schema": {
      "type": "string"
    }
  }
]
```
Request body:
```json
{
  "type": "object",
  "properties": {
    "reason": {
      "type": "string",
      "maxLength": 500
    },
    "restoreSlots": {
      "type": "boolean",
      "default": false
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Penalty revoked (kèm restoredCount, skipped[])"
  },
  "400": {
    "description": "Bad request (validation or malformed body)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Validation failed",
            "errors": [
              {
                "field": "email",
                "message": "Invalid email address"
              }
            ]
          }
        }
      }
    }
  },
  "401": {
    "description": "Missing, invalid or expired token",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Unauthorized: invalid or expired token"
          }
        }
      }
    }
  },
  "403": {
    "description": "Insufficient role permissions",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Forbidden: insufficient permissions"
          }
        }
      }
    }
  },
  "404": {
    "description": "Resource not found",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Record not found"
          }
        }
      }
    }
  },
  "409": {
    "description": "Duplicate value or business conflict",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Duplicate value for: email"
          }
        }
      }
    }
  },
  "500": {
    "description": "Unexpected internal server error",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": false,
            "message": "Internal server error"
          }
        }
      }
    }
  }
}
```
