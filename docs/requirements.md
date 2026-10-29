# ASEMS Requirements Specification

**Project:** Ambo University Academic and Administrative Performance Evaluation System (ASEMS)  
**Status:** Approved baseline for implementation  
**Source documents:** `Academic Staff Evaluation Forms.docx`, `Important notice for Understanding of Programmer.docx`, and the project specification supplied by the project owner.

## 1. Purpose and scope

ASEMS is a web application to administer academic staff performance evaluations, calculate the prescribed weighted result, route evaluation summaries through institutional review, and preserve evaluation records. The implementation must use JavaScript, React with Vite, Node.js/Express, and MySQL.

This document records requirements supported by the supplied project documents and explicit decisions from the project owner. It does not add evaluation criteria beyond the official forms.

## 2. Confirmed scoring rules

The final instructor score is out of 100%, with these fixed component weights:

| Evaluation component | Weight |
|---|---:|
| Student evaluation (Form A) | 40% |
| Department Head evaluation (Form B) | 35% |
| Peer evaluation (Form C) | 15% |
| Instructor self-evaluation (Form D) | 10% |
| **Total** | **100%** |

**Completion gate:** Calculate and finalize the overall weighted score only after all four components have been submitted. Until all four have been submitted, the overall score must be marked incomplete/not finalized. The UI may show submission progress, but must not present a partial weighted total as the final score.

The official forms use rating options `5, 4, 3, 2, 1, 0, NA`. The official documents do not fully specify how `NA`, rounding, or missing individual responses affect the component average. These details must remain configurable or be confirmed with the institution before implementing final scoring behavior; the application must not silently invent a rule.

## 3. Official evaluation forms

Use the criteria and section headings from the official forms as the source of truth. Do not invent, rewrite, or add evaluation criteria.

### Form A — Teachers' evaluation to be filled by students
The form contains 30 numbered criteria organized under:
- Instructional skills
- Professional Ethics and Attitude Towards Students
- Assessment Methods & Feedback

It also asks for the instructor's strengths and suggested points/aspects to improve.

### Form B — Teachers' evaluation to be filled by the Department Head
The form contains 27 numbered criteria organized under:
- Core Competency
- Professional Competency
- Time Management
- Ethical Competence

It also asks for the instructor's strengths and suggested points/aspects to improve.

### Form C — Teachers' evaluation to be filled by peer
The form contains 26 numbered criteria organized under:
- Subject Matter Competency
- Research and Community Services
- Professional Competency
- Ethical Competence
- Time Management

It also asks for the instructor's strengths and suggested points/aspects to improve.

### Form D — Teachers' self-evaluation
Use the complete criteria and section organization in the official form, including its instructional skills, professional ethics/attitude, assessment and feedback, overall personal behavior, professional attitude, and interpersonal relationship sections. Transcribe the complete source form before configuring these criteria in the database. Do not infer missing or unclear numbering as new criteria.

### Form E — Teachers' evaluation summary sheet
The summary sheet reports the four component results using the official weights, component averages out of 5, remarks, the total result out of 100%, and final committee/head comments. It includes teacher and head/leader name, date, and signature fields. The source says three copies are prepared: one for the teacher, one for the department, and one for the College/Institute/School.

## 4. Actors and responsibilities

The following actors are identified by the supplied programmer notice:

1. **Students:** Evaluate instructional skills, course delivery, classroom management, professional ethics, assessment/feedback, and responsiveness using Form A.
2. **Department Head:** Evaluates the instructor using Form B; coordinates evaluation activities and submits results through prescribed channels.
3. **Peer instructors:** Evaluate colleagues using Form C.
4. **Instructor / self-evaluator:** Completes Form D.
5. **Ad-hoc Evaluation Committee / officially delegated body:** Helps administer evaluations, selects students and staff for evaluation, explains the process, coordinates fair participation, and contributes to the final summary.
6. **College / School / Institute Administration:** Receives summarized departmental results, reviews/processes reports, and forwards them to the Academic Affairs Vice President's Office.
7. **College / School Dean or Vice Dean:** Evaluates the Department Head.
8. **Academic Affairs Vice President / Academic Affairs Vice Director:** Evaluates the Dean.
9. **Academic Affairs Vice President's Office / Campus Academic Vice Director:** Receives summaries and officially forwards them for archiving, copying the instructor and department.
10. **University/department archives:** Preserve records at department, college, school, and university levels.
11. **Concerned offices and directorates:** Consult academic units to address performance gaps and support capacity-building.

The implementation must allow these institutional responsibilities to be represented without granting every actor access to all confidential data.

## 5. Approval and reporting workflow

The confirmed report approval order is:

**Committee → Department Head → College → VP's Office**

The system must record the current workflow stage, the actor and timestamp for each action, and relevant comments/decision history. The workflow must not allow skipping stages or acting on a report outside the user's authorization. The documents also identify evaluation responsibilities for Dean/Vice Dean and Academic Affairs leadership; these must be supported in the broader institutional workflow, while the four-stage instructor report approval sequence above remains the confirmed approval path.

## 6. Initial system modules

- Authentication, logout, profile, and protected routes
- Role-based access control (RBAC)
- Dashboard and evaluation progress
- User and role management
- Departments and academic units
- Courses and instructor records/assignments
- Evaluation periods/cycles and deadlines
- Official evaluation forms, sections, criteria, rating scales, and comments
- Evaluation assignments and completion tracking
- Evaluation submission and receipt
- Component scoring and final weighted score gated on all four submissions
- Form E summary sheet and authorized reports
- Committee/Department Head/College/VP's Office workflow
- Notifications and reminders
- Settings and audit trail
- Archival and record retrieval

## 7. Access control and confidentiality

The project specification proposes these application roles: System Administrator, University Administrator, Department Head, Instructor, and Student/Evaluator. The institutional notice additionally identifies peer instructors, committee/delegated body, college/school/institute administration, Dean/Vice Dean, Academic Affairs leadership/office, archives, and concerned offices. The role model should support these responsibilities using explicit permissions and organizational scope rather than assuming each institutional actor is a global administrator.

Authorization must be enforced by the backend, not only by hiding frontend navigation. Enforce least privilege, verify department/institution scope on every relevant request, and protect individual evaluation responses and reports according to rules confirmed by the institution. Store passwords as bcrypt hashes; use environment-managed JWT secrets; validate inputs; parameterize SQL; rate-limit authentication endpoints; and maintain audit records for sensitive actions.

## 8. Technical architecture

- **Frontend:** React, Vite, JavaScript, Tailwind CSS, React Router.
- **Backend:** Node.js and Express.js.
- **Database:** MySQL, database name `ASEMS`, accessed through `mysql2`.
- **Authentication:** JWT and bcrypt.
- **API verification:** Postman.
- **Version control:** Git and GitHub.

Backend layering: **Routes → Controllers → Services → Repositories → MySQL**. Use consistent API response/error handling, request validation, pagination/filtering where appropriate, transactions for multi-step writes, secure configuration, and documented REST endpoints.

## 9. Data model scope

The planned normalized schema should cover users, roles/permissions, departments, academic units, courses, instructors, evaluation cycles, forms, sections/criteria, assignments, submissions, ratings/answers, comments, workflow decisions, notifications, audit events, and calculated summaries where appropriate. Use primary/foreign keys, suitable unique constraints and indexes, timestamps, and transactions. Exact uniqueness rules for submissions and evaluator assignment must follow the confirmed institutional workflow.

## 10. UI/UX requirements

Use a responsive, accessible, professional university interface with deep navy, white/neutral surfaces, and restrained gold/teal accents. Include role-aware navigation, dashboard indicators, searchable/filterable tables, validation, loading/empty/error states, clear status labels, confirmation dialogs, and usable mobile layouts. Charts and reports must use backend data when integrated; demo values must be clearly labelled as sample data.

## 11. Open decisions — do not silently assume

Before final scoring and sensitive workflow behavior are finalized, confirm:
- How `NA` is excluded or handled in averages.
- Whether a component can be submitted if some criteria are `NA` or unanswered.
- Rounding/precision rules for component and final scores.
- What to do when a required evaluator or assignment has not submitted by the deadline.
- Whether a submitted response can be edited/reopened and who can authorize it.
- Which actors can view individual responses versus only aggregated results.
- Exact review/approval decision options and whether rejection returns a report to a prior stage.
- The complete machine-readable transcription of Form D's criteria from the official document.

Until confirmed, preserve the source options and data and avoid applying an undocumented scoring or privacy rule.

## 12. Acceptance criteria

- The application starts from documented setup instructions with separate frontend/backend processes.
- The frontend communicates with the Express API, never directly with MySQL.
- API endpoints enforce authentication, authorization, validation, and scope.
- Official forms use only source criteria.
- The four component weights remain 40/35/15/10.
- A final overall score is not calculated or displayed as final until all four components are submitted.
- Reports follow Committee → Department Head → College → VP's Office.
- Workflow actions and sensitive data access are auditable.
- Setup, schema, API, and test instructions are documented.
