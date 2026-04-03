# Angular Routes (generated 2026-04-03)
# 6 routes. [lazy]=lazy-loaded, guard:/resolve:=route metadata.

/                                                        HomePageComponent
/products                                                ProductsPageComponent
/products/:id                                            ProductDetailPageComponent [resolve:productResolver]
/account                                                 AccountShellComponent [guard:authGuard]
/account/orders                                          OrdersPageComponent
/admin                                                   loadChildren ./admin/admin.routes#ADMIN_ROUTES [lazy,guard:adminGuard]