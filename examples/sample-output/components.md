# Components (generated 2026-04-03)
# (s)=standalone. in=inputs, out=outputs.

## pages
(s) HomePageComponent  <app-home-page>
(s) ProductsPageComponent  <app-products-page>

## features/products/ui
(s) ProductCardComponent  <app-product-card>  in: product, compact  out: addToCart
(s) ProductFiltersComponent  <app-product-filters>  in: selectedCategory  out: categoryChange

## shared/layout
(s) AppShellComponent  <app-shell>
    HeaderComponent  <app-header>  in: user