# ASEMS role-specific login and sticky login header

Changes are limited to the selected-role login flow and login-page header:

- The public category selection now passes an expected account role to the login page.
- The frontend sends that role with the login request.
- The backend checks the authenticated account's database role against the selected category before issuing a session token. A mismatch is rejected.
- The login page header is sticky so it remains at the top while scrolling.

Role mapping uses the roles already supported by the existing application:
- Students -> `student`
- Department Head -> `department_head`
- Peer Instructors and Instructor (Self-Evaluator) -> `teacher`
- Ad-hoc Evaluation Committee / Officially Delegated Body -> `committee`
- College / School / Institute Administration -> `management`
- College / School Dean / Vice Dean -> `dean`
- Academic Affairs VP / Vice Director and related campus academic leadership -> `academic_vp`
- University / Department Archives -> `archives`
- Concerned Offices and Directorates -> `concerned_office`

The category is only a login check; it does not grant a role or change authorization. The database role remains authoritative. Existing login calls that do not provide a selected role retain their previous behavior.
