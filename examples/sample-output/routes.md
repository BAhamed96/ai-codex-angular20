# API Routes (generated 2026-04-03)
# 8 routes total. [auth,cache,db]=high-signal tags.

## auth
POST         /api/auth/login [auth]
POST         /api/auth/refresh [auth]

## orders
GET,POST     /api/orders [auth,db]
GET          /api/orders/:id [auth,db]
POST         /api/orders/:id/refund [auth,db]

## users
GET          /api/users/me [auth,db]
PATCH        /api/users/:id [auth,db]

## health
GET          /api/health