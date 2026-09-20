# OpenAPI endpoint inventory

Source: https://sports-center-management-system.onrender.com/api/v1/docs/swagger-ui-init.js

Snapshot: 2026-09-12. Production base: https://sports-center-management-system.onrender.com/api/v1

Response examples are documentation only, never application data. Coaches use undefined bearerAuth capitalization; client sends the documented HTTP Bearer token.

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
        "STAFF",
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
                "email": "staff@sportscenter.com",
                "fullName": "Jane Doe",
                "phone": "0900000002",
                "gender": "FEMALE",
                "dateOfBirth": null,
                "role": "STAFF",
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
Create staff, coach, manager or member account (MEMBER creates the member profile too)

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
      "type": "string"
    },
    "password": {
      "type": "string"
    },
    "fullName": {
      "type": "string"
    },
    "role": {
      "type": "string",
      "enum": [
        "MEMBER",
        "COACH",
        "STAFF",
        "MANAGER"
      ]
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
Update user

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
Deactivate user (soft delete)

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

## POST /subscriptions
Register member to a membership plan

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
    "planId",
    "paymentMethod"
  ],
  "properties": {
    "memberId": {
      "type": "string"
    },
    "planId": {
      "type": "string"
    },
    "startDate": {
      "type": "string"
    },
    "paymentMethod": {
      "type": "string",
      "enum": [
        "CASH",
        "BANK_TRANSFER"
      ]
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
    "description": "Subscription created with its payment",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Subscription created successfully",
            "data": {
              "subscription": {
                "id": "9643ec65-bacb-4b1b-9442-239bb60bd8fa",
                "tier": "MEMBERSHIP",
                "startDate": "2026-09-11T14:20:14.968Z",
                "endDate": "2026-10-11T14:20:14.968Z",
                "status": "ACTIVE",
                "plan": {
                  "name": "Membership Monthly",
                  "tier": "MEMBERSHIP"
                }
              },
              "payment": {
                "id": "322da21d-5040-44b8-90cc-cfc9eeff2631",
                "amount": "300000",
                "method": "CASH",
                "status": "SUCCESS"
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

## POST /subscriptions/{id}/renew
Renew a membership subscription

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
    "planId",
    "paymentMethod"
  ],
  "properties": {
    "planId": {
      "type": "string"
    },
    "paymentMethod": {
      "type": "string",
      "enum": [
        "CASH",
        "BANK_TRANSFER"
      ]
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
    "description": "Subscription created with its payment",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Subscription created successfully",
            "data": {
              "subscription": {
                "id": "9643ec65-bacb-4b1b-9442-239bb60bd8fa",
                "tier": "MEMBERSHIP",
                "startDate": "2026-09-11T14:20:14.968Z",
                "endDate": "2026-10-11T14:20:14.968Z",
                "status": "ACTIVE",
                "plan": {
                  "name": "Membership Monthly",
                  "tier": "MEMBERSHIP"
                }
              },
              "payment": {
                "id": "322da21d-5040-44b8-90cc-cfc9eeff2631",
                "amount": "300000",
                "method": "CASH",
                "status": "SUCCESS"
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

## GET /subscriptions/member/{memberId}
Get all subscriptions for a member

Authentication: [{"BearerAuth":[]}]

Parameters: 
```json
[
  {
    "in": "path",
    "name": "memberId",
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
        "ACTIVE",
        "EXPIRED",
        "CANCELLED",
        "SUSPENDED"
      ]
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
    "description": "Paginated list of subscriptions (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Subscriptions retrieved successfully",
            "data": [
              {
                "id": "9643ec65-bacb-4b1b-9442-239bb60bd8fa",
                "tier": "MEMBERSHIP",
                "startDate": "2026-09-11T14:20:14.968Z",
                "endDate": "2026-10-11T14:20:14.968Z",
                "status": "ACTIVE",
                "plan": {
                  "name": "Membership Monthly",
                  "tier": "MEMBERSHIP"
                },
                "payments": [
                  {
                    "id": "322da21d-5040-44b8-90cc-cfc9eeff2631",
                    "amount": "300000",
                    "status": "SUCCESS"
                  }
                ]
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

## GET /subscriptions/{id}
Get subscription by ID

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
    "description": "Single subscription",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Subscription retrieved successfully",
            "data": {
              "id": "9643ec65-bacb-4b1b-9442-239bb60bd8fa",
              "tier": "MEMBERSHIP",
              "startDate": "2026-09-11T14:20:14.968Z",
              "endDate": "2026-10-11T14:20:14.968Z",
              "status": "ACTIVE",
              "plan": {
                "name": "Membership Monthly",
                "tier": "MEMBERSHIP"
              },
              "member": {
                "user": {
                  "fullName": "John Doe",
                  "email": "member1@example.com"
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

## PATCH /subscriptions/{id}/status
Update subscription status

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
        "ACTIVE",
        "EXPIRED",
        "CANCELLED",
        "SUSPENDED"
      ]
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single subscription",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Subscription retrieved successfully",
            "data": {
              "id": "9643ec65-bacb-4b1b-9442-239bb60bd8fa",
              "tier": "MEMBERSHIP",
              "startDate": "2026-09-11T14:20:14.968Z",
              "endDate": "2026-10-11T14:20:14.968Z",
              "status": "ACTIVE",
              "plan": {
                "name": "Membership Monthly",
                "tier": "MEMBERSHIP"
              },
              "member": {
                "user": {
                  "fullName": "John Doe",
                  "email": "member1@example.com"
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

## GET /sports
Get list of sports

Authentication: []

Parameters: 
```json
[
  {
    "in": "query",
    "name": "search",
    "schema": {
      "type": "string"
    },
    "description": "Search by name"
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
    },
    "description": "Filter by active status"
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
    "description": "Paginated list of sports (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Sports retrieved successfully",
            "data": [
              {
                "id": "c3e1ef3e-0000-4000-8000-000000000001",
                "name": "Yoga",
                "description": "Yoga class improves flexibility",
                "isActive": true,
                "_count": {
                  "classes": 2
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

## POST /sports
Create a new sport

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
    "name"
  ],
  "properties": {
    "name": {
      "type": "string",
      "example": "Yoga"
    },
    "description": {
      "type": "string",
      "example": "Yoga class improves flexibility"
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Sport created",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Sport created successfully",
            "data": {
              "id": "c3e1ef3e-0000-4000-8000-000000000009",
              "name": "Boxing",
              "description": "Boxing classes",
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

## GET /sports/{id}
View sport details

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
    "description": "Single sport",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Sport retrieved successfully",
            "data": {
              "id": "c3e1ef3e-0000-4000-8000-000000000001",
              "name": "Yoga",
              "isActive": true,
              "classes": []
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

## PATCH /sports/{id}
Update sport

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
    "description": "Single sport",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Sport retrieved successfully",
            "data": {
              "id": "c3e1ef3e-0000-4000-8000-000000000001",
              "name": "Yoga",
              "isActive": true,
              "classes": []
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

## DELETE /sports/{id}
Deactivate sport (soft delete)

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
    "description": "Single sport",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Sport retrieved successfully",
            "data": {
              "id": "c3e1ef3e-0000-4000-8000-000000000001",
              "name": "Yoga",
              "isActive": true,
              "classes": []
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
      "example": "Yoga Room A"
    },
    "capacity": {
      "type": "integer",
      "example": 20
    },
    "location": {
      "type": "string",
      "example": "Floor 1"
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
              "totalPayments": 2,
              "successPayments": 2,
              "failedPayments": 0,
              "pendingPayments": 0,
              "refundedPayments": 0,
              "revenueByMethod": {
                "CASH": 300000,
                "BANK_TRANSFER": 600000
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
                  },
                  "invoice": {
                    "invoiceNumber": "INV-1789136414987-002"
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
  "200": {
    "description": "Membership report",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Membership report retrieved successfully",
            "data": {
              "totalSubscriptions": 2,
              "newSubscriptions": 1,
              "activeSubscriptions": 2,
              "expiredSubscriptions": 0,
              "cancelledSubscriptions": 0,
              "suspendedSubscriptions": 0,
              "subscriptionsByTier": {
                "MEMBERSHIP": 1,
                "PREMIUM": 1
              },
              "totalRevenue": 900000
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

## POST /payments
Record a payment (auto-creates invoice on SUCCESS)

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
      "type": "string"
    },
    "subscriptionId": {
      "type": "string"
    },
    "amount": {
      "type": "number"
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
      ]
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
    "description": "Payment recorded (invoice auto-created on SUCCESS)",
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
              },
              "invoice": {
                "invoiceNumber": "INV-1789136414987-001"
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
        "BANK_TRANSFER"
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
                },
                "invoice": {
                  "invoiceNumber": "INV-1789136414987-001"
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
              },
              "invoice": {
                "invoiceNumber": "INV-1789136414987-001"
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

## PATCH /payments/{id}/status
Update payment status

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
              },
              "invoice": {
                "invoiceNumber": "INV-1789136414987-001"
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

## GET /membership-plans
List membership plans (public)

Authentication: []

Parameters: 
```json
[
  {
    "in": "query",
    "name": "tier",
    "schema": {
      "type": "string",
      "enum": [
        "MEMBERSHIP",
        "PREMIUM"
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
    "description": "Paginated list of membership plans (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Plans retrieved successfully",
            "data": [
              {
                "id": "plan-basic-001",
                "name": "Membership Monthly",
                "description": "Basic monthly membership",
                "price": "300000",
                "durationDays": 30,
                "tier": "MEMBERSHIP",
                "isActive": true
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

## POST /membership-plans
Create membership plan

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
    "price",
    "durationDays",
    "tier"
  ],
  "properties": {
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "price": {
      "type": "number"
    },
    "durationDays": {
      "type": "integer"
    },
    "tier": {
      "type": "string",
      "enum": [
        "MEMBERSHIP",
        "PREMIUM"
      ]
    }
  }
}
```
Responses/status codes:
```json
{
  "201": {
    "description": "Plan created",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Plan created successfully",
            "data": {
              "id": "plan-basic-004",
              "name": "Membership Weekly",
              "price": "100000",
              "durationDays": 7,
              "tier": "MEMBERSHIP",
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

## GET /membership-plans/{id}
Get plan details (public)

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
    "description": "Single membership plan",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Plan retrieved successfully",
            "data": {
              "id": "plan-basic-001",
              "name": "Membership Monthly",
              "price": "300000",
              "durationDays": 30,
              "tier": "MEMBERSHIP",
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

## PATCH /membership-plans/{id}
Update membership plan

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
    "description": "Single membership plan",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Plan retrieved successfully",
            "data": {
              "id": "plan-basic-001",
              "name": "Membership Monthly",
              "price": "300000",
              "durationDays": 30,
              "tier": "MEMBERSHIP",
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

## DELETE /membership-plans/{id}
Deactivate membership plan

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
    "description": "Single membership plan",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Plan retrieved successfully",
            "data": {
              "id": "plan-basic-001",
              "name": "Membership Monthly",
              "price": "300000",
              "durationDays": 30,
              "tier": "MEMBERSHIP",
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
    "description": "Effective member tier and active subscription",
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

## GET /invoices
List all invoices

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
        "ISSUED",
        "CANCELLED"
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
    "description": "Paginated list of invoices (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Invoices retrieved successfully",
            "data": [
              {
                "id": "6b6b6b6b-0000-4000-8000-000000000301",
                "invoiceNumber": "INV-1789136414987-001",
                "subtotal": "300000",
                "discount": "0",
                "total": "300000",
                "status": "ISSUED",
                "issuedAt": "2026-09-12T08:00:00.000Z",
                "member": {
                  "user": {
                    "fullName": "John Doe"
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

## GET /invoices/member/{memberId}
Get invoices for a specific member

Authentication: [{"BearerAuth":[]}]

Parameters: 
```json
[
  {
    "in": "path",
    "name": "memberId",
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
    "description": "Paginated list of invoices (compact example)",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Invoices retrieved successfully",
            "data": [
              {
                "id": "6b6b6b6b-0000-4000-8000-000000000301",
                "invoiceNumber": "INV-1789136414987-001",
                "subtotal": "300000",
                "discount": "0",
                "total": "300000",
                "status": "ISSUED",
                "issuedAt": "2026-09-12T08:00:00.000Z",
                "member": {
                  "user": {
                    "fullName": "John Doe"
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

## GET /invoices/{id}
Get invoice by ID

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
    "description": "Single invoice",
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "example": {
            "success": true,
            "message": "Invoice retrieved successfully",
            "data": {
              "id": "6b6b6b6b-0000-4000-8000-000000000301",
              "invoiceNumber": "INV-1789136414987-001",
              "subtotal": "300000",
              "discount": "0",
              "total": "300000",
              "status": "ISSUED",
              "issuedAt": "2026-09-12T08:00:00.000Z",
              "member": {
                "user": {
                  "fullName": "John Doe",
                  "email": "member1@example.com"
                }
              },
              "payment": {
                "amount": "300000",
                "method": "CASH",
                "status": "SUCCESS"
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

## POST /enrollments
Book a class (Member books own class; Staff/Manager book for a member)

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
      "type": "string"
    },
    "memberId": {
      "type": "string",
      "description": "Required when booked by Staff/Manager"
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
                  "name": "Morning Yoga",
                  "sport": {
                    "name": "Yoga"
                  }
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

## DELETE /enrollments/{id}
Cancel an enrollment

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
                  "name": "Morning Yoga",
                  "sport": {
                    "name": "Yoga"
                  }
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

## GET /coaches
List all coaches

Authentication: [{"bearerAuth":[]}]

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

## GET /coaches/{id}
Get coach by ID

Authentication: [{"bearerAuth":[]}]

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
                    "isPrimary": true,
                    "class": {
                      "id": "class-yoga-001",
                      "name": "Morning Yoga",
                      "sport": {
                        "name": "Yoga"
                      },
                      "schedules": []
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
Update coach profile

Authentication: [{"bearerAuth":[]}]

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
                    "isPrimary": true,
                    "class": {
                      "id": "class-yoga-001",
                      "name": "Morning Yoga",
                      "sport": {
                        "name": "Yoga"
                      },
                      "schedules": []
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
    "name": "sportId",
    "schema": {
      "type": "string"
    },
    "description": "Filter by sport"
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
    "description": "Filter by class type"
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
                "sport": {
                  "name": "Yoga"
                },
                "capacity": 15,
                "classType": "REGULAR",
                "isActive": true,
                "coaches": [
                  {
                    "isPrimary": true,
                    "coach": {
                      "user": {
                        "fullName": "Coach One"
                      }
                    }
                  }
                ],
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
Create a new class

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
    "sportId",
    "capacity"
  ],
  "properties": {
    "name": {
      "type": "string",
      "example": "Morning Yoga"
    },
    "description": {
      "type": "string"
    },
    "sportId": {
      "type": "string"
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
      "default": "REGULAR"
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
              "sport": {
                "name": "Boxing"
              },
              "capacity": 12,
              "classType": "REGULAR"
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
    "description": "Single class with coaches and upcoming schedules",
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
              "sport": {
                "name": "Yoga"
              },
              "capacity": 15,
              "classType": "REGULAR",
              "isActive": true,
              "coaches": [
                {
                  "isPrimary": true,
                  "coach": {
                    "user": {
                      "fullName": "Coach One"
                    }
                  }
                }
              ],
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
    "description": {
      "type": "string"
    },
    "sportId": {
      "type": "string"
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
    "description": "Single class with coaches and upcoming schedules",
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
              "sport": {
                "name": "Yoga"
              },
              "capacity": 15,
              "classType": "REGULAR",
              "isActive": true,
              "coaches": [
                {
                  "isPrimary": true,
                  "coach": {
                    "user": {
                      "fullName": "Coach One"
                    }
                  }
                }
              ],
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
    "description": "Single class with coaches and upcoming schedules",
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
              "sport": {
                "name": "Yoga"
              },
              "capacity": 15,
              "classType": "REGULAR",
              "isActive": true,
              "coaches": [
                {
                  "isPrimary": true,
                  "coach": {
                    "user": {
                      "fullName": "Coach One"
                    }
                  }
                }
              ],
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

## POST /classes/{id}/coaches
Assign coach to class

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
{
  "type": "object",
  "required": [
    "coachId"
  ],
  "properties": {
    "coachId": {
      "type": "string",
      "description": "CoachProfile ID"
    },
    "isPrimary": {
      "type": "boolean",
      "default": false,
      "description": "Set as primary coach"
    }
  }
}
```
Responses/status codes:
```json
{
  "200": {
    "description": "Single class with coaches and upcoming schedules",
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
              "sport": {
                "name": "Yoga"
              },
              "capacity": 15,
              "classType": "REGULAR",
              "isActive": true,
              "coaches": [
                {
                  "isPrimary": true,
                  "coach": {
                    "user": {
                      "fullName": "Coach One"
                    }
                  }
                }
              ],
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

## DELETE /classes/{id}/coaches/{coachId}
Remove coach from class

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
  },
  {
    "in": "path",
    "name": "coachId",
    "required": true,
    "schema": {
      "type": "string"
    },
    "description": "CoachProfile ID"
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
    "description": "Single class with coaches and upcoming schedules",
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
              "sport": {
                "name": "Yoga"
              },
              "capacity": 15,
              "classType": "REGULAR",
              "isActive": true,
              "coaches": [
                {
                  "isPrimary": true,
                  "coach": {
                    "user": {
                      "fullName": "Coach One"
                    }
                  }
                }
              ],
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
    "description": "Schedules starting before this time"
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
                  "sport": {
                    "name": "Yoga"
                  }
                },
                "room": {
                  "name": "Yoga Room A"
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
Create a new schedule (checks room & coach conflicts)

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
                "sport": {
                  "name": "Yoga"
                },
                "coaches": []
              },
              "room": {
                "name": "Yoga Room A"
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
        "CANCELLED",
        "COMPLETED"
      ],
      "description": "If set to CANCELLED, all BOOKED enrollments are cancelled automatically"
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
                "sport": {
                  "name": "Yoga"
                },
                "coaches": []
              },
              "room": {
                "name": "Yoga Room A"
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
Cancel schedule (automatically cancels all BOOKED enrollments)

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
                "sport": {
                  "name": "Yoga"
                },
                "coaches": []
              },
              "room": {
                "name": "Yoga Room A"
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
      "format": "email"
    },
    "password": {
      "type": "string",
      "minLength": 6
    },
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
