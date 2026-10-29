-- Read-only checks for the supplied ASEMS schema. These queries do not modify data.
-- Run against a backed-up development database before using official evaluation data.

-- 1) Show parallel section sets for each form; confirm which set is institutionally authoritative.
SELECT f.code, f.title, s.id AS section_id, s.section_key, s.title, COUNT(c.id) AS active_criteria
FROM evaluation_forms f
JOIN form_sections s ON s.form_id = f.id
LEFT JOIN form_criteria c ON c.section_id = s.id AND c.is_active = 1
GROUP BY f.id, f.code, f.title, s.id, s.section_key, s.title
ORDER BY f.code, s.id;

-- 2) Find stored evaluation scores whose criterion is not part of that assignment's form.
-- This may flag seeded/test rows; review results before making any corrective update.
SELECT es.id AS score_id, es.evaluation_id, a.id AS assignment_id,
       f.code AS assigned_form_code, es.criterion_id,
       criterion_form.code AS criterion_form_code,
       c.text AS criterion_text
FROM evaluation_scores es
JOIN evaluations e ON e.id = es.evaluation_id
JOIN evaluation_assignments a ON a.id = e.assignment_id
JOIN evaluation_forms f ON f.id = a.form_id
JOIN form_criteria c ON c.id = es.criterion_id
JOIN form_sections s ON s.id = c.section_id
JOIN evaluation_forms criterion_form ON criterion_form.id = s.form_id
WHERE f.id <> criterion_form.id
ORDER BY es.evaluation_id, es.criterion_id;

-- 3) Review existing assignment and evaluation status combinations.
SELECT a.id AS assignment_id, a.status AS assignment_status,
       e.id AS evaluation_id, e.status AS evaluation_status,
       f.code AS form_code, a.instructor_id, a.evaluator_id, cy.title AS cycle_title
FROM evaluation_assignments a
JOIN evaluation_forms f ON f.id = a.form_id
JOIN evaluation_cycles cy ON cy.id = a.cycle_id
LEFT JOIN evaluations e ON e.assignment_id = a.id
ORDER BY a.id;

-- 4) Check active users and role distribution without exposing password hashes.
SELECT role, status, COUNT(*) AS user_count
FROM users
GROUP BY role, status
ORDER BY role, status;
