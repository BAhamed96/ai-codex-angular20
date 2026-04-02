# Database Schema (generated 2026-04-02)
# 6 models. PK=primary key, UQ=unique. Only key/FK/enum fields shown.

## User
  id                     String    PK
  email                  String    UQ
  -> Order[], Review[], Address[]

## Product
  id                     String    PK
  slug                   String    UQ
  categoryId             String
  status                 ProductStatus
  -> Category, OrderItem[], Review[]

**Category** id(PK) | slug(UQ) -> Product[]
**Order** id(PK) | userId | status -> User, OrderItem[]
**OrderItem** id(PK) | orderId | productId -> Order, Product
**Review** id(PK) | userId | productId -> User, Product
