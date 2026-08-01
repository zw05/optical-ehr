-- Flip existing Rx print templates to the bordered OD/OS table layout.
UPDATE "ReportTemplate"
SET layout = jsonb_set(layout, '{valueLayout}', '"table"', true)
WHERE kind IN ('spectacle-rx', 'contact-lens-rx');
