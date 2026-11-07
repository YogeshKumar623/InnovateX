/* Optional authenticated API mode for the same InnovateX screens. */
(() => {
  const tokenKey = 'innovatex_api_token';
  let token = localStorage.getItem(tokenKey);
  let apiMode = Boolean(token);
  const original = { render, logout, createChallenge, updateChallenge, deleteChallenge, toggleChallenge, join, createProposal, submitReview, shortlist, declareWinner, saveSettings, modalChallenge, editChallenge, modalReview };
  const req = async (route, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(`/api${route}`, { ...options, headers });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
    return data;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safe = fn => async (...args) => { try { return await fn(...args); } catch (e) { toast(e.message); } };
  const fromChallenge = c => ({ id: c._id, title: c.title, category: c.category, status: c.status, description: c.description, deadline: String(c.deadline).slice(0, 10), prize: c.prize || 'Prize TBA', participants: Array.isArray(c.participants) ? c.participants.length : 0, reviewers: c.reviewers || [], criteria: c.criteria || [] });
  const fromProposal = p => ({ id: p._id, challengeId: p.challenge?._id || p.challenge, title: p.title, team: p.participant?.name || p.team || 'Participant', challenge: p.challenge?.title || p.challengeTitle || 'Challenge', status: p.status, score: Number(p.score || 0), innovation: p.innovation || p.problem || '', solution: p.solution || '', attachment: p.attachment, feedbackReleased: Boolean(p.feedbackReleased), feedback: p.reviews?.map(r => r.feedback).filter(Boolean).join(' · ') || '' });
  async function hydrate() {
    const [challenges, proposals] = await Promise.all([req('/challenges'), req('/proposals')]);
    db.challenges = challenges.map(fromChallenge);
    if (user.role === 'Participant') {
      const details = await Promise.all(proposals.map(p => req(`/proposals/${p._id}`)));
      db.proposals = details.map(fromProposal);
    } else {
      db.proposals = proposals.map(fromProposal);
    }
    if (user.role === 'Administrator') {
      const users = await req('/users');
      db.users = users.map(x => ({ id: x._id, name: x.name, email: x.email, role: x.role }));
    }
    render();
  }
  async function signIn(email, password) {
    const result = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    token = result.token; localStorage.setItem(tokenKey, token); apiMode = true;
    user = { ...result.user, id: result.user.id };
    sessionStorage.setItem('innovatex_user', JSON.stringify(user));
    page = 'Overview'; await hydrate(); toast(`Signed in as ${user.role.toLowerCase()}`);
  }
  async function registerAccount(name, email, password, role) {
    const result = await req('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
    token = result.token; localStorage.setItem(tokenKey, token); apiMode = true;
    user = result.user; sessionStorage.setItem('innovatex_user', JSON.stringify(user));
    db.proposals = []; page = 'Overview'; await hydrate(); toast('Account created');
  }
  function authDialog() {
    const body = `<div class="toolbar" style="margin:0 0 16px"><button class="button small" id="loginTab" type="button">Sign in</button><button class="button ghost small" id="registerTab" type="button">Create account</button></div><form id="apiAuthForm"><div class="formgrid"><div class="formgroup full" id="nameField" style="display:none"><label>Full name</label><input class="field" name="name" autocomplete="name"></div><div class="formgroup full"><label>Email</label><input required class="field" type="email" name="email" autocomplete="username"></div><div class="formgroup full"><label>Password</label><input required minlength="8" class="field" type="password" name="password" autocomplete="current-password"></div><div class="formgroup full" id="roleField" style="display:none"><label>Account role</label><select class="field" name="role"><option>Participant</option><option>Reviewer</option></select></div></div><button class="button lime" style="margin-top:17px" id="authSubmit">Sign in ↗</button><p class="mono" style="margin-top:15px">DEMO ADMIN: admin@demo.com · DemoAdmin123!<br>PARTICIPANT: aarav@demo.com · DemoUser123!<br>REVIEWER: anika@demo.com · DemoReview123!</p></form>`;
    const box = modal('InnovateX workspace', body);
    let registering = false;
    const setTab = value => { registering = value; box.querySelector('#nameField').style.display = value ? '' : 'none'; box.querySelector('#roleField').style.display = value ? '' : 'none'; box.querySelector('[name=password]').autocomplete = value ? 'new-password' : 'current-password'; box.querySelector('#authSubmit').textContent = value ? 'Create account ↗' : 'Sign in ↗'; box.querySelector('#loginTab').className = `button small ${value ? 'ghost' : ''}`; box.querySelector('#registerTab').className = `button small ${value ? '' : 'ghost'}`; };
    box.querySelector('#loginTab').onclick = () => setTab(false); box.querySelector('#registerTab').onclick = () => setTab(true);
    box.querySelector('#apiAuthForm').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.currentTarget); try { if (registering) await registerAccount(f.get('name'), f.get('email'), f.get('password'), f.get('role')); else await signIn(f.get('email'), f.get('password')); box.remove(); } catch (err) { toast(err.message); } };
    return box;
  }
  window.logout = function () { if (apiMode) { token = null; localStorage.removeItem(tokenKey); apiMode = false; user = { name: 'Alex Morgan', role: 'Administrator', email: 'admin@demo.com' }; authDialog(); } else { original.logout(); } };
  window.render = function () { original.render(); const crumb = document.querySelector('.crumb'); if (crumb && apiMode) crumb.textContent += ' · DATABASE CONNECTED'; };

  window.createChallenge = safe(async e => {
    if (!apiMode) return original.createChallenge(e);
    e.preventDefault(); const f = new FormData(e.target);
    const criteria = ['Innovation','Feasibility','Technical Implementation','Problem Solving','Potential Impact'].map((name, i) => ({ name, weight: Number(f.get(`weight${i}`)) }));
    if (criteria.some(c => !Number.isFinite(c.weight) || c.weight < 0) || criteria.reduce((n, c) => n + c.weight, 0) !== 100) throw new Error('Evaluation weights must total 100%.');
    const c = await req('/challenges', { method: 'POST', body: JSON.stringify({ title: f.get('title'), category: f.get('category'), deadline: f.get('deadline'), prize: f.get('prize'), status: f.get('status'), description: f.get('description'), criteria }) });
    db.challenges.unshift(fromChallenge(c)); save(); document.querySelector('.modalback')?.remove(); toast('Challenge created in MongoDB'); render();
  });
  window.modalChallenge = function () {
    if (!apiMode) return original.modalChallenge();
    original.modalChallenge();
    const form = document.querySelector('.modalback form');
    if (!form) return;
    const row = document.createElement('div'); row.className = 'formgroup full';
    row.innerHTML = `<label>Evaluation weights · total must equal 100%</label><div class="formgrid">${['Innovation','Feasibility','Technical implementation','Problem solving','Potential impact'].map((label, i) => `<div class="formgroup"><label>${label}</label><input class="field" name="weight${i}" type="number" min="0" max="100" value="${[30,20,20,15,15][i]}" required></div>`).join('')}</div>`;
    form.querySelector('.formgrid').append(row);
  };
  window.updateChallenge = safe(async (e, id) => {
    if (!apiMode) return original.updateChallenge(e, id);
    e.preventDefault(); const f = new FormData(e.target); const values = Object.fromEntries(['title','category','deadline','prize','status','description'].map(k => [k, f.get(k)]));
    if (e.target.elements.weight0) { values.criteria = ['Innovation','Feasibility','Technical Implementation','Problem Solving','Potential Impact'].map((name, i) => ({ name, weight: Number(f.get(`weight${i}`)) })); if (values.criteria.some(c => !Number.isFinite(c.weight) || c.weight < 0) || values.criteria.reduce((n, c) => n + c.weight, 0) !== 100) throw new Error('Evaluation weights must total 100%.'); }
    const c = await req(`/challenges/${id}`, { method: 'PATCH', body: JSON.stringify(values) }); const i = db.challenges.findIndex(x => x.id === id); db.challenges[i] = fromChallenge(c); save(); document.querySelector('.modalback')?.remove(); toast('Challenge updated'); render();
  });
  window.editChallenge = function (id) {
    if (!apiMode) return original.editChallenge(id);
    const c = db.challenges.find(x => x.id === id), weights = c.criteria?.length ? c.criteria : [{name:'Innovation',weight:30},{name:'Feasibility',weight:20},{name:'Technical Implementation',weight:20},{name:'Problem Solving',weight:15},{name:'Potential Impact',weight:15}];
    modal('Edit challenge', `<form onsubmit="updateChallenge(event,'${id}')"><div class="formgrid"><div class="formgroup full"><label>Title</label><input required class="field" name="title" value="${c.title}"></div><div class="formgroup"><label>Category</label><input required class="field" name="category" value="${c.category}"></div><div class="formgroup"><label>Deadline</label><input required type="date" class="field" name="deadline" value="${c.deadline}"></div><div class="formgroup"><label>Prize</label><input class="field" name="prize" value="${c.prize}"></div><div class="formgroup"><label>Status</label><select class="field" name="status">${['Open','Coming soon','Closed'].map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="formgroup full"><label>Description</label><textarea required class="field" name="description">${c.description}</textarea></div><div class="formgroup full"><label>Evaluation weights · total must equal 100%</label><div class="formgrid">${weights.map((w,i)=>`<div class="formgroup"><label>${w.name}</label><input required class="field" type="number" min="0" max="100" name="weight${i}" value="${w.weight}"></div>`).join('')}</div></div></div><button class="button lime" style="margin-top:18px">Save changes</button></form>`);
  };
  window.deleteChallenge = safe(async id => { if (!apiMode) return original.deleteChallenge(id); if (!confirm('Delete this challenge and its proposals?')) return; await req(`/challenges/${id}`, { method: 'DELETE' }); db.challenges = db.challenges.filter(c => c.id !== id); db.proposals = db.proposals.filter(p => p.challengeId !== id); document.querySelector('.modalback')?.remove(); toast('Challenge deleted'); render(); });
  window.toggleChallenge = safe(async id => { if (!apiMode) return original.toggleChallenge(id); const c = db.challenges.find(x => x.id === id); const updated = await req(`/challenges/${id}`, { method: 'PATCH', body: JSON.stringify({ status: c.status === 'Open' ? 'Closed' : 'Open' }) }); Object.assign(c, fromChallenge(updated)); document.querySelector('.modalback')?.remove(); toast(`Challenge ${c.status.toLowerCase()}`); render(); });
  window.join = safe(async id => {
    if (!apiMode) return original.join(id);
    if (user.role === 'Administrator') {
      const c = db.challenges.find(x => x.id === id), reviewers = db.users.filter(x => x.role === 'Reviewer');
      const box = modal(c.title, `<p>${c.description}</p><p class="mono">${c.participants} PARTICIPANTS · DEADLINE ${c.deadline}</p><div class="formgroup"><label>Assigned reviewers</label><select class="field" id="assignedReviewers" multiple size="${Math.max(2, Math.min(5, reviewers.length))}">${reviewers.map(r => `<option value="${r.id}" ${(c.reviewers || []).some(v => (v._id || v) === r.id) ? 'selected' : ''}>${r.name} · ${r.email}</option>`).join('')}</select><small class="mono">Hold Ctrl or ⌘ to select multiple.</small></div><div style="display:flex;gap:8px;margin-top:15px;flex-wrap:wrap"><button class="button lime" onclick="saveReviewers('${id}')">Save reviewer assignments</button><button class="button ghost" onclick="editChallenge('${id}')">Edit</button><button class="button" onclick="toggleChallenge('${id}')">${c.status === 'Open' ? 'Close' : 'Publish'}</button><button class="button" style="background:var(--orange)" onclick="deleteChallenge('${id}')">Delete</button></div>`);
      req(`/challenges/${id}/registrations`).then(rows => { const line = box.querySelector('.mono'); if (line) line.textContent += ` · ${rows.length} REGISTERED`; }).catch(() => {});
      return;
    }
    if (user.role !== 'Participant') return original.join(id);
    await req(`/challenges/${id}/register`, { method: 'POST' }); const c = db.challenges.find(x => x.id === id); c.participants++; save(); toast(`You joined ${c.title}`); render();
  });
  window.saveReviewers = safe(async id => { const reviewerIds = [...document.getElementById('assignedReviewers').selectedOptions].map(o => o.value); const c = await req(`/challenges/${id}/reviewers`, { method: 'PUT', body: JSON.stringify({ reviewerIds }) }); const local = db.challenges.find(x => x.id === id); local.reviewers = c.reviewers; document.querySelector('.modalback')?.remove(); toast('Reviewer assignments saved'); render(); });
  window.createProposal = safe(async e => {
    if (!apiMode) return original.createProposal(e);
    e.preventDefault(); const form = e.target, fd = new FormData(form); fd.set('challenge', form.elements.challenge.value);
    const file = form.querySelector('input[type=file]')?.files?.[0]; if (file) fd.set('attachment', file);
    const p = await req('/proposals', { method: 'POST', body: fd }); db.proposals.unshift(fromProposal({ ...p, participant: user, challenge: db.challenges.find(c => c.id === p.challenge)?.title })); save(); document.querySelector('.modalback')?.remove(); toast('Proposal submitted to MongoDB'); go('Submissions');
  });
  window.submitReview = safe(async (e, id) => {
    if (!apiMode) return original.submitReview(e, id);
    e.preventDefault(); const f = new FormData(e.target), proposal = db.proposals.find(p => p.id === id), challenge = db.challenges.find(c => c.id === proposal?.challengeId), criteria = challenge?.criteria || []; const scores = Object.fromEntries(criteria.map((criterion, i) => [criterion.name, Number(f.get(`s${i}`))]));
    await req(`/proposals/${id}/reviews`, { method: 'POST', body: JSON.stringify({ scores, feedback: f.get('feedback') }) }); document.querySelector('.modalback')?.remove(); await hydrate(); const p = db.proposals.find(x => x.id === id); toast(`Evaluation saved · average score ${p?.score.toFixed(2) || 'updated'}`);
  });
  window.modalReview = function (id) {
    if (!apiMode) return original.modalReview(id);
    const p = db.proposals.find(x => x.id === id), challenge = db.challenges.find(c => c.id === p?.challengeId), criteria = challenge?.criteria || [];
    modal('A considered review', `<form onsubmit="submitReview(event,'${id}')"><p class="mono">${esc(p.title)} · ${esc(p.team)}</p><p style="font-size:12px;line-height:1.6">${esc(p.innovation || p.solution)}</p><div class="formgrid">${criteria.map((c,i)=>`<div class="formgroup"><label>${esc(c.name)} · ${Number(c.weight)}%</label><input required type="number" min="1" max="10" value="8" class="field" name="s${i}"></div>`).join('')}<div class="formgroup full"><label>Feedback for the team</label><textarea class="field" name="feedback" placeholder="Be specific, constructive, and kind."></textarea></div></div><button class="button lime" style="margin-top:18px">Submit evaluation ↗</button></form>`);
  };
  window.shortlist = safe(async () => { if (!apiMode) return original.shortlist(); const id = document.getElementById('finalSelect').value; await req(`/results/${id}/shortlist`, { method: 'POST' }); const p = db.proposals.find(x => x.id === id); p.status = 'Finalist'; save(); toast(`${p.title} shortlisted`); render(); });
  window.declareWinner = safe(async () => { if (!apiMode) return original.declareWinner(); const id = document.getElementById('winnerSelect').value; await req(`/results/${id}/winner`, { method: 'POST' }); db.proposals.forEach(p => { if (p.status === 'Winner') p.status = 'Finalist'; }); const p = db.proposals.find(x => x.id === id); p.status = 'Winner'; save(); toast(`${p.title} announced as winner`); render(); });
  window.saveSettings = safe(async () => { if (!apiMode) return original.saveSettings(); const name = document.getElementById('setName').value.trim(); if (!name) return toast('Name cannot be empty'); const result = await req('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name }) }); user = result.user; sessionStorage.setItem('innovatex_user', JSON.stringify(user)); toast('Profile updated'); render(); });
  window.render = function () {
    const savedDb = db, savedUser = user;
    if (apiMode) {
      const safeValue = v => typeof v === 'string' ? esc(v) : Array.isArray(v) ? v.map(safeValue) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,safeValue(x)])) : v;
      db = safeValue(db); user = safeValue(user);
    }
    try { original.render(); } finally { db = savedDb; user = savedUser; }
    const crumb = document.querySelector('.crumb'); if (crumb && apiMode) crumb.textContent += ' · DATABASE CONNECTED';
    if (!apiMode) return;
    if (user.role === 'Administrator') {
      const values = [db.challenges.filter(c=>c.status==='Open').length, db.users.filter(u=>u.role==='Participant').length, db.proposals.length, db.proposals.filter(p=>['Submitted','Under review'].includes(p.status)).length];
      document.querySelectorAll('.metric strong').forEach((el,i)=>{ if (values[i] !== undefined) el.textContent = values[i]; });
    }
    const newChallenge = document.querySelector('.headrow > .button[onclick="modalChallenge()"]'); if (newChallenge) newChallenge.hidden = user.role !== 'Administrator';
    const role = document.querySelector('#setRole'); if (role) { role.disabled = true; role.title = 'Role changes are managed by an administrator'; }
    if (page === 'Submissions') {
      const table = document.querySelector('.table');
      if (table) {
        table.querySelector('thead tr')?.insertAdjacentHTML('beforeend', '<th>FILES / ACTIONS</th>');
        [...table.querySelectorAll('tbody tr')].forEach((row, i) => {
          const p = db.proposals[i]; if (!p) return;
          const edit = user.role === 'Participant' ? `<button class="button ghost small" onclick="editProposal('${p.id}')">Edit</button>` : '';
          const file = p.attachment ? `<button class="button ghost small" onclick="downloadAttachment('${p.id}')">Open file ↗</button>` : '';
          const release = user.role === 'Administrator' ? `<button class="button ghost small" onclick="releaseFeedback('${p.id}',${!p.feedbackReleased})">${p.feedbackReleased?'Hide feedback':'Release feedback'}</button>` : '';
          row.insertAdjacentHTML('beforeend', `<td>${edit} ${file} ${release}${user.role === 'Participant' && p.feedback ? `<small style="display:block;margin-top:7px">Feedback: ${p.feedback}</small>` : ''}</td>`);
        });
      }
    }
    if (page === 'Overview' && user.role === 'Administrator') {
      req('/analytics').then(stats => {
        const metrics = document.querySelector('.metrics'); if (!metrics || document.querySelector('#analyticsPanel')) return;
        const rows = stats.challengePerformance || [], max = Math.max(1, ...rows.map(x => x.submissions));
        const panel = document.createElement('div'); panel.id = 'analyticsPanel'; panel.className = 'panel'; panel.style.marginTop = '18px';
        panel.innerHTML = `<div class="panelhead"><h2>Challenge performance</h2><span class="mono">LIVE DATABASE · SUBMISSIONS</span></div><div style="padding:18px 20px;display:grid;gap:12px">${rows.map(x=>`<div style="display:grid;grid-template-columns:minmax(120px,1fr) 3fr 24px;gap:12px;align-items:center;font-size:11px"><span>${esc(x.title)}</span><span class="bar"><i style="width:${Math.max(2, x.submissions/max*100)}%"></i></span><span class="mono">${x.submissions}</span></div>`).join('') || '<span class="mono">No submissions yet</span>'}</div>`;
        metrics.insertAdjacentElement('afterend', panel);
      }).catch(() => {});
    }
  };
  window.editProposal = safe(async id => {
    const p = db.proposals.find(x => x.id === id);
    const box = modal('Refine your proposal', `<form id="editProposalForm"><div class="formgrid"><div class="formgroup full"><label>Project title</label><input required class="field" name="title" value="${esc(p.title)}"></div><div class="formgroup full"><label>Problem statement</label><textarea required class="field" name="problem">${esc(p.innovation || '')}</textarea></div><div class="formgroup full"><label>Proposed solution</label><textarea required class="field" name="solution">${esc(p.solution || '')}</textarea></div><div class="formgroup full"><label>Supporting file (optional)</label><input class="field" type="file" accept=".pdf,.ppt,.pptx,.doc,.docx"><small class="mono">You can edit until the challenge deadline.</small></div></div><button class="button lime" style="margin-top:18px">Save proposal</button></form>`);
    box.querySelector('form').onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); const file = e.currentTarget.querySelector('input[type=file]').files[0]; if (file) fd.set('attachment', file); try { const updated = await req(`/proposals/${id}`, { method: 'PATCH', body: fd }); Object.assign(p, fromProposal({ ...updated, participant: user, challenge: p.challenge })); save(); box.remove(); toast('Proposal updated'); render(); } catch (err) { toast(err.message); } };
  });
  window.releaseFeedback = safe(async (id, released) => { await req(`/proposals/${id}/feedback`, { method: 'PUT', body: JSON.stringify({ released }) }); const p = db.proposals.find(x => x.id === id); p.feedbackReleased = released; toast(released ? 'Feedback released to the participant' : 'Feedback hidden'); render(); });
  window.downloadAttachment = safe(async id => { const response = await fetch(`/api/proposals/${id}/attachment`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) { const d = await response.json().catch(() => ({})); throw new Error(d.error || 'Could not download attachment'); } const blob = await response.blob(), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `proposal-${id}`; a.click(); URL.revokeObjectURL(url); });
  if (apiMode) req('/auth/me').then(({ user: active }) => { user = active; sessionStorage.setItem('innovatex_user', JSON.stringify(user)); return hydrate(); }).catch(err => { token = null; localStorage.removeItem(tokenKey); apiMode = false; toast(err.message); render(); });
  else render();
})();
