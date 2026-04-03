# Database Schema (generated 2026-04-03)
# 5 models. PK=primary key, UQ=unique. Only key/FK/enum fields shown.

## User
  id                     String    PK
  email                  String    UQ
  -> Order[], Address[]

## Product
  id                     String    PK
  slug                   String    UQ
  status                 ProductStatus
  categoryId             String
  -> Category, OrderItem[]

**Category** id(PK) | slug(UQ) -> Product[]
**Order** id(PK) | userId | status -> User, OrderItem[]
**OrderItem** id(PK) | orderId | productId -> Order, Product