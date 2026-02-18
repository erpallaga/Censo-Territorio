---
description: SOP for UI/UX adjustments with Git branching and Vercel Previews
---

# Workflow for UI/UX and Feature Development

To ensure best practices, follow this workflow for every new feature, UI/UX adjustment, or bug fix.

## 1. Branching
Never work directly on the `main` branch. Create a new branch for every feature.
- **Naming**: Use a prefix like `feature/` or `fix/`.
- **Command**:
  ```bash
  git checkout -b feature/<your-feature-name>
  ```

## 2. Development & Local Testing
Develop your changes and test them locally.
- Run the app locally (e.g., `python app.py`).
- Iteratively improve your UI/UX.

## 3. Vercel Preview Deployment
Push your branch to the remote repository (GitHub) to trigger a **Vercel Preview Deployment**.
- **Command**:
  ```bash
  git push -u origin feature/<your-feature-name>
  ```
- Vercel automatically creates a unique URL for this branch (e.g., `project-git-feature-new-ui.vercel.app`).
- **Best Practice**: Use this URL to validate the design and functionality in a production-like environment before merging.

## 4. Pull Request & Review
Once you are happy with the preview:
- Create a Pull Request (PR) from your feature branch to `main`.
- Review the changes (or ask a team member to review).
- The PR will also display the Vercel Preview link.

## 5. Merging to Main
After validation and approval:
- Merge the Pull Request.
- Vercel will trigger a **Production Deployment** from `main`.
- Your changes are now live!
- **Cleanup**: Delete your feature branch locally and remotely.

## Example Scenario: Adjusting Button Colors
1. `git checkout -b feature/refactor-buttons`
2. Change CSS in `public/style.css`.
3. `git add . && git commit -m "UI: Refactor button colors for better contrast"`
4. `git push -u origin feature/refactor-buttons`
5. Visit the Preview URL provided by Vercel/GitHub.
6. Verify colors on mobile and desktop.
7. Merge PR to `main`.
