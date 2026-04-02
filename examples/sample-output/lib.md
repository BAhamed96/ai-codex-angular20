# Library Exports (generated 2026-04-02)
# fn=function, class=class. Type-only files omitted.

## lib
cart-utils.ts
  fn calculateTotal
  fn applyDiscount
  fn formatPrice
  fn getCartItemCount

auth.ts
  fn validateSession
  fn hashPassword
  fn verifyToken

stripe.ts  fn createPaymentIntent
email.ts  fn sendOrderConfirmation
db.ts  fn getDbClient
validation.ts  fn validateProductInput

## lib/hooks
# 4 single-export files:
useCart:useCart  |  useAuth:useAuth  |  useProducts:useProducts
useDebounce:useDebounce
