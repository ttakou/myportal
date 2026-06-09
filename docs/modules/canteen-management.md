# Canteen Management Module

**Status:** Draft v0.1
**Last updated:** 2026-06-09

## 1. Purpose

Digitize the end-to-end operation of workplace canteens: publishing menus,
taking and fulfilling orders, handling payments and subsidies, managing
vendors and inventory, and giving administrators visibility into consumption
and cost. The module serves organizations (tenants) of the portal, each of
which may operate one or more canteens/cafeterias across one or more sites.

## 2. User Roles

| Role | Description |
|------|-------------|
| **Employee (Consumer)** | Browses menus, places orders, pays (or uses subsidy/wallet), gives feedback. |
| **Canteen Staff** | Views incoming orders, updates preparation/fulfillment status, manages daily item availability. |
| **Canteen Manager / Vendor** | Manages menus, pricing, item catalog, staff, and operating hours; views demand forecasts and settlement reports. |
| **Org Admin (HR/Facilities)** | Configures canteens, subsidy policies, meal plans, and approval rules; views consumption and cost reports. |
| **Portal Super Admin** | Tenant-level provisioning, enabling/disabling the module, global settings. |

## 3. Functional Scope

### 3.1 Canteen & Outlet Setup
- Create and manage canteens per site/location (name, location, capacity, operating hours, holiday calendar).
- Multiple counters/outlets per canteen (e.g., main kitchen, coffee bar, snack counter).
- Assign vendors/managers and staff to canteens.
- Configure service modes per canteen: dine-in, takeaway/pickup, desk delivery, pre-order only, walk-in.

### 3.2 Menu & Catalog Management
- Item catalog: name, description, photo, category (breakfast/lunch/snacks/beverages), cuisine, veg/non-veg/vegan flags, allergens, nutritional info, price.
- Daily/weekly menu planning: publish menus per canteen per meal slot (breakfast, lunch, dinner, snacks) with cut-off times for ordering.
- Combo/thali/meal-deal support (bundles with a single price).
- Real-time availability toggling and stock-count limits per item (sold-out handling).
- Menu templates and copy-forward (repeat last week's menu).

### 3.3 Ordering
- Browse today's/this week's menu; search and filter (veg, allergen-free, price).
- Pre-order for a future date/slot and same-day ordering until cut-off.
- Cart, order placement, modification/cancellation until a configurable cut-off.
- Recurring orders / meal-plan opt-in (e.g., "lunch every weekday").
- Group/guest orders (order on behalf of a visitor or a meeting).
- Order statuses: Placed → Confirmed → Preparing → Ready → Delivered/Picked up → Closed; Cancelled/No-show as terminal states.
- QR-code or order-number based pickup verification at the counter.
- Walk-in (POS-style) billing for users who don't pre-order, including badge/employee-ID tap to identify the employee.

### 3.4 Payments, Wallet & Subsidies
- Payment methods: prepaid canteen wallet, payroll deduction, corporate-paid (fully subsidized), and online payment (card/UPI/PSP) at checkout.
- Canteen wallet: top-up (online payment or payroll), balance, transaction history, low-balance alerts, refunds to wallet on cancellation.
- Subsidy engine: org-defined rules such as flat per-meal subsidy, percentage subsidy, daily/monthly caps, role- or grade-based policies, guest-meal policies.
- Meal coupons/vouchers (digital) issuance and redemption.
- Clear price breakdown at checkout: item price − subsidy = employee pays.
- Vendor settlement: periodic statement of orders fulfilled, subsidy amounts owed by the org vs. amounts collected from employees, with export for finance.

### 3.5 Kitchen & Fulfillment Operations
- Live order queue per counter (kitchen display): accept, mark preparing/ready, call out order numbers.
- Demand summary for the kitchen before each slot (e.g., 240 pre-orders for lunch: 180 veg thali, 60 chicken curry) to plan production.
- Token/queue management for walk-ins.
- No-show handling: auto-cancel and configurable charge policy after grace period.

### 3.6 Inventory & Procurement (optional/phase 2)
- Track raw-material stock against menu consumption.
- Low-stock alerts and purchase requests to vendors/suppliers.
- Wastage logging per day/slot.

### 3.7 Feedback & Quality
- Per-order and per-item ratings and comments.
- Daily meal feedback survey (taste, hygiene, quantity).
- Complaint flow with escalation to canteen manager/org admin and resolution tracking.
- Hygiene/audit checklist for canteen staff (optional).

### 3.8 Notifications
- Menu published for the day/week (push/email, per user preference).
- Order confirmations, "order ready" alerts, cut-off reminders for recurring orders.
- Low wallet balance, top-up confirmations.
- Admin alerts: heavy demand vs. stock, settlement ready, complaint escalations.

### 3.9 Reports & Analytics
- Consumption: orders per day/slot/canteen, top items, veg vs. non-veg mix.
- Financial: revenue, subsidy outflow, wallet liability, payroll deduction file, vendor settlement.
- Operational: no-show rate, average fulfillment time, wastage, feedback scores trend.
- Forecasting: predicted demand per item/slot based on history (phase 2).
- Exports: CSV/XLSX; payroll-deduction export in the payroll system's format.

## 4. Core Entities (high level)

```
Canteen ──< Counter
Canteen ──< MenuDay ──< MenuSlot ──< MenuItemOffering >── CatalogItem
Employee ──< Order ──< OrderLine >── MenuItemOffering
Employee ──1 Wallet ──< WalletTransaction
Org ──< SubsidyPolicy
Vendor ──< Settlement ──< SettlementLine
Order ──< Feedback
```

## 5. Key Business Rules (initial)

1. Orders are accepted only between menu publish time and the slot's cut-off.
2. Subsidy is computed at order time and locked; later policy changes don't affect placed orders.
3. Cancellation after cut-off follows the org's charge policy (full charge / partial / free).
4. Wallet balance can't go negative; payroll-deduction mode may allow a configurable credit limit.
5. An employee's orders are visible only to the employee, canteen staff fulfilling them, and org admins (privacy).
6. All money movements (top-up, payment, subsidy, refund, settlement) are ledgered and immutable; corrections are compensating entries.

## 6. Integration Points with Other Modules

- **Identity/HR module:** employee directory, grades (for subsidy policy), joiners/leavers (auto-close wallet on exit).
- **Payroll module:** deduction file / API for payroll-deduction payment mode and wallet top-up via salary.
- **Attendance/Access module (optional):** badge tap identification at POS; site presence to default the canteen.
- **Notification service:** all alerts in §3.8.
- **Payments infrastructure:** PSP integration for online top-up/checkout.
- **Reporting/BI module:** feeds consumption and financial data.

## 7. Out of Scope (for v1)

- Inventory/procurement (§3.6) and demand forecasting — phase 2.
- Multi-currency settlement (assume one currency per org in v1).
- Catering for events (separate request flow, possibly a future module).

## 8. Open Questions

1. Is the canteen operated in-house or by third-party vendors (affects settlement complexity)? Both are modeled above; confirm which to build first.
2. Which payment modes are mandatory for v1 — wallet only, or payroll deduction too?
3. Do we need offline/POS hardware support at the counter, or is a tablet web app sufficient?
4. Tax handling on meals (e.g., GST/VAT on subsidized portion) — needs finance input per region.
5. Should guests/contractors be able to order without an employee sponsor?
