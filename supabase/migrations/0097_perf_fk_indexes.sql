-- Performance: index every unindexed foreign key.
--
-- Supabase's performance advisor flagged 95 foreign-key columns with no
-- covering index. Unindexed FKs force sequential scans on joins and on the
-- referential-integrity checks Postgres runs for cascading updates/deletes, and
-- the ubiquitous `tenant_id` columns are filtered on essentially every query in
-- this multi-tenant app. Each index is created `if not exists` and is a plain
-- b-tree on the FK column, so this migration is idempotent and safe to re-run.

-- Airport / transport
create index if not exists idx_airport_assistance_transport_request_id on public.airport_assistance (transport_request_id);
create index if not exists idx_transport_requests_driver_id on public.transport_requests (driver_id);
create index if not exists idx_transport_requests_requester_id on public.transport_requests (requester_id);
create index if not exists idx_transport_requests_vehicle_id on public.transport_requests (vehicle_id);
create index if not exists idx_transport_task_checklist_tenant_id on public.transport_task_checklist (tenant_id);
create index if not exists idx_transport_task_updates_author_id on public.transport_task_updates (author_id);
create index if not exists idx_transport_task_updates_tenant_id on public.transport_task_updates (tenant_id);

-- Appraisals
create index if not exists idx_appraisal_appeals_opened_by on public.appraisal_appeals (opened_by);
create index if not exists idx_appraisal_appeals_resolved_by on public.appraisal_appeals (resolved_by);
create index if not exists idx_appraisal_appeals_tenant_id on public.appraisal_appeals (tenant_id);
create index if not exists idx_appraisal_calibration_adjustments_adjusted_by on public.appraisal_calibration_adjustments (adjusted_by);
create index if not exists idx_appraisal_calibration_adjustments_tenant_id on public.appraisal_calibration_adjustments (tenant_id);
create index if not exists idx_appraisal_competency_ratings_competency_id on public.appraisal_competency_ratings (competency_id);
create index if not exists idx_appraisal_competency_ratings_tenant_id on public.appraisal_competency_ratings (tenant_id);
create index if not exists idx_appraisal_cycles_created_by on public.appraisal_cycles (created_by);
create index if not exists idx_appraisal_department_objectives_created_by on public.appraisal_department_objectives (created_by);
create index if not exists idx_appraisal_development_plans_created_by on public.appraisal_development_plans (created_by);
create index if not exists idx_appraisal_development_plans_tenant_id on public.appraisal_development_plans (tenant_id);
create index if not exists idx_appraisal_events_actor_id on public.appraisal_events (actor_id);
create index if not exists idx_appraisal_events_tenant_id on public.appraisal_events (tenant_id);
create index if not exists idx_appraisal_goal_history_changed_by on public.appraisal_goal_history (changed_by);
create index if not exists idx_appraisal_goal_history_goal_id on public.appraisal_goal_history (goal_id);
create index if not exists idx_appraisal_goal_history_tenant_id on public.appraisal_goal_history (tenant_id);
create index if not exists idx_appraisal_goal_raters_created_by on public.appraisal_goal_raters (created_by);
create index if not exists idx_appraisal_goal_raters_tenant_id on public.appraisal_goal_raters (tenant_id);
create index if not exists idx_appraisal_goals_tenant_id on public.appraisal_goals (tenant_id);
create index if not exists idx_appraisal_key_results_tenant_id on public.appraisal_key_results (tenant_id);
create index if not exists idx_appraisal_pips_created_by on public.appraisal_pips (created_by);
create index if not exists idx_appraisal_pips_manager_id on public.appraisal_pips (manager_id);

-- Canteen
create index if not exists idx_canteen_bookings_dish_id on public.canteen_bookings (dish_id);
create index if not exists idx_canteen_bookings_kitchen_id on public.canteen_bookings (kitchen_id);
create index if not exists idx_canteen_bookings_profile_id on public.canteen_bookings (profile_id);
create index if not exists idx_canteen_dishes_kitchen_id on public.canteen_dishes (kitchen_id);
create index if not exists idx_canteen_feedback_booking_id on public.canteen_feedback (booking_id);
create index if not exists idx_canteen_feedback_profile_id on public.canteen_feedback (profile_id);
create index if not exists idx_canteen_feedback_resolved_by on public.canteen_feedback (resolved_by);
create index if not exists idx_canteen_meal_entitlements_granted_by on public.canteen_meal_entitlements (granted_by);
create index if not exists idx_canteen_meal_entitlements_tenant_id on public.canteen_meal_entitlements (tenant_id);
create index if not exists idx_canteen_meal_redemptions_redeemed_by on public.canteen_meal_redemptions (redeemed_by);
create index if not exists idx_canteen_option_groups_tenant_id on public.canteen_option_groups (tenant_id);
create index if not exists idx_canteen_options_tenant_id on public.canteen_options (tenant_id);

-- Emergency (EESS)
create index if not exists idx_eess_broadcasts_created_by on public.eess_broadcasts (created_by);
create index if not exists idx_eess_checkins_profile_id on public.eess_checkins (profile_id);
create index if not exists idx_eess_incident_updates_author_id on public.eess_incident_updates (author_id);
create index if not exists idx_eess_incident_updates_tenant_id on public.eess_incident_updates (tenant_id);
create index if not exists idx_eess_incidents_acknowledged_by on public.eess_incidents (acknowledged_by);
create index if not exists idx_eess_incidents_resolved_by on public.eess_incidents (resolved_by);

-- Admin / audit
create index if not exists idx_impersonation_audit_actor_id on public.impersonation_audit (actor_id);
create index if not exists idx_impersonation_audit_target_id on public.impersonation_audit (target_id);
create index if not exists idx_impersonation_audit_tenant_id on public.impersonation_audit (tenant_id);
create index if not exists idx_notifications_tenant_id on public.notifications (tenant_id);
create index if not exists idx_tenant_services_service_id on public.tenant_services (service_id);
create index if not exists idx_profile_access_roles_tenant_id on public.profile_access_roles (tenant_id);
create index if not exists idx_profile_roles_tenant_id on public.profile_roles (tenant_id);
create index if not exists idx_profiles_appraisal_delegate_id on public.profiles (appraisal_delegate_id);

-- Loans / savings / medical
create index if not exists idx_loan_repayments_tenant_id on public.loan_repayments (tenant_id);
create index if not exists idx_loans_tenant_id on public.loans (tenant_id);
create index if not exists idx_medical_records_created_by on public.medical_records (created_by);
create index if not exists idx_medical_records_tenant_id on public.medical_records (tenant_id);
create index if not exists idx_savings_accounts_profile_id on public.savings_accounts (profile_id);
create index if not exists idx_savings_transactions_created_by on public.savings_transactions (created_by);
create index if not exists idx_savings_transactions_tenant_id on public.savings_transactions (tenant_id);

-- Performance (nine-box / OKR / feedback)
create index if not exists idx_nine_box_profile_id on public.nine_box (profile_id);
create index if not exists idx_nine_box_set_by on public.nine_box (set_by);
create index if not exists idx_okr_key_results_tenant_id on public.okr_key_results (tenant_id);
create index if not exists idx_okr_objectives_tenant_id on public.okr_objectives (tenant_id);
create index if not exists idx_perf_feedback_from_id on public.perf_feedback (from_id);
create index if not exists idx_perf_feedback_tenant_id on public.perf_feedback (tenant_id);

-- Offshore
create index if not exists idx_offshore_bed_allocations_visit_request_id on public.offshore_bed_allocations (visit_request_id);
create index if not exists idx_offshore_crews_installation_id on public.offshore_crews (installation_id);
create index if not exists idx_offshore_emergency_roles_profile_id on public.offshore_emergency_roles (profile_id);
create index if not exists idx_offshore_manifest_pax_profile_id on public.offshore_manifest_pax (profile_id);
create index if not exists idx_offshore_manifest_pax_tenant_id on public.offshore_manifest_pax (tenant_id);
create index if not exists idx_offshore_manifest_pax_visit_request_id on public.offshore_manifest_pax (visit_request_id);
create index if not exists idx_offshore_manifests_crew_id on public.offshore_manifests (crew_id);
create index if not exists idx_offshore_manifests_flight_id on public.offshore_manifests (flight_id);
create index if not exists idx_offshore_manifests_installation_id on public.offshore_manifests (installation_id);
create index if not exists idx_offshore_muster_checkins_accounted_by on public.offshore_muster_checkins (accounted_by);
create index if not exists idx_offshore_muster_checkins_profile_id on public.offshore_muster_checkins (profile_id);
create index if not exists idx_offshore_muster_checkins_tenant_id on public.offshore_muster_checkins (tenant_id);
create index if not exists idx_offshore_muster_drills_started_by on public.offshore_muster_drills (started_by);
create index if not exists idx_offshore_muster_drills_tenant_id on public.offshore_muster_drills (tenant_id);
create index if not exists idx_offshore_visit_requests_approved_by on public.offshore_visit_requests (approved_by);
create index if not exists idx_offshore_visit_requests_installation_id on public.offshore_visit_requests (installation_id);
create index if not exists idx_offshore_visit_requests_requester_id on public.offshore_visit_requests (requester_id);

-- Out-of-town travel
create index if not exists idx_out_of_town_trips_finance_approved_by on public.out_of_town_trips (finance_approved_by);
create index if not exists idx_out_of_town_trips_manager_approved_by on public.out_of_town_trips (manager_approved_by);
create index if not exists idx_out_of_town_trips_requester_id on public.out_of_town_trips (requester_id);
create index if not exists idx_trip_checkins_profile_id on public.trip_checkins (profile_id);
create index if not exists idx_trip_checkins_tenant_id on public.trip_checkins (tenant_id);
create index if not exists idx_trip_expenses_tenant_id on public.trip_expenses (tenant_id);

-- Visitors / staff attendance
create index if not exists idx_staff_attendance_checked_in_by on public.staff_attendance (checked_in_by);
create index if not exists idx_staff_attendance_checked_out_by on public.staff_attendance (checked_out_by);
create index if not exists idx_visitors_created_by on public.visitors (created_by);
create index if not exists idx_visitors_host_id on public.visitors (host_id);
