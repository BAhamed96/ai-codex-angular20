# API Routes (generated 2026-04-02)
# 12 routes total.

## auth
POST         /api/auth/login
POST         /api/auth/register
POST         /api/auth/logout
POST         /api/auth/refresh [auth]

## products
GET,POST     /api/products [auth,db]
GET,PUT,DELETE /api/products/:id [auth,db]
POST         /api/products/:id/images [auth]

## orders
GET,POST     /api/orders [auth,db]
GET          /api/orders/:id [auth,db]
POST         /api/orders/:id/refund [auth,db]

## users
GET,PUT      /api/users/me [auth,db]
