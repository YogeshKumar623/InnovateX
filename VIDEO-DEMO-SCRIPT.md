# InnovateX video demo script

**Target length:** about 4 minutes  
**Use:** Open `index.html` or double-click `Open-InnovateX-Demo.bat`. The browser demo stores its data in that browser's local storage.

## 1. Introduction — 20 seconds

**Say:**

“Hello, this is InnovateX, an innovation challenge management system. It helps an organization publish challenges, lets participants submit ideas, and gives reviewers a consistent way to score proposals. Administrators can then shortlist finalists and announce results.”

## 2. Administrator overview — 40 seconds

**Show:** Overview page and the left navigation.

**Say:**

“The overview brings the workspace together. It shows challenge and submission summaries, recent activity, and the current top proposals. The sidebar takes us to challenges, submissions, reviews, the leaderboard, results, and team information.”

“As an administrator, I can create a challenge with a title, category, description, deadline, prize, and open or coming-soon status.”

**Optional action:** Click **New challenge**, enter a short example, and create it. Then open **Challenges** to show the new card and search or filter the list.

## 3. Participant journey — 50 seconds

**Show:** Click the arrow beside the profile at the bottom of the sidebar and choose the Participant demo role. Open **Challenges**.

**Say:**

“A participant can browse and filter available challenges, then join one. After choosing a challenge, they can submit a project title, explain the problem, and describe their proposed solution. Their submission appears in the submissions list with its review status.”

**Optional action:** Join a challenge, then submit a short example proposal. Skip the attachment in this browser demo: local demo mode does not upload or retain files.

## 4. Reviewer journey and scoring — 60 seconds

**Show:** Switch to the Reviewer demo role, then open **Reviews** and choose **Evaluate** on a pending proposal.

**Say:**

“Reviewers see proposals waiting for evaluation. They score each proposal from one to ten across five criteria: Innovation at 30 percent, Feasibility at 20 percent, Technical Implementation at 20 percent, Problem Solving at 15 percent, and Potential Impact at 15 percent. InnovateX calculates the weighted score from those values and lets the reviewer leave feedback.”

**Optional action:** Submit an evaluation and point out the score and updated proposal status.

## 5. Rankings and results — 45 seconds

**Show:** **Leaderboard**, then switch to the Administrator role and open **Results**.

**Say:**

“The leaderboard orders proposals by their evaluation scores and highlights the top positions. The administrator can shortlist finalists and announce a winner. The results page presents the finalist and winner cards.”

**Optional action:** Shortlist a proposal and announce a winner. This changes the saved demo data in the browser.

## 6. Closing — 20 seconds

**Say:**

“That is the main InnovateX workflow: publish a challenge, join and submit an idea, review it using weighted criteria, and share the final ranking. The interface is responsive and the browser demo remembers changes in this browser.”

## Accuracy note for questions

This recording demonstrates the browser demo. In this mode, role switching is a demo control rather than real sign-in, and records are saved in browser storage rather than MongoDB. The project also contains an Express/MongoDB backend, but the Atlas connection has not been verified in the current environment. Do not describe the browser demo as using live authentication, shared database storage, or file uploads.
