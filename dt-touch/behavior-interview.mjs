const questions = {
  pattern: ['Is this typical for this dancer, or was today unusual?', ['Very unusual', 'Happens occasionally', 'More frequent lately', 'Ongoing concern', 'I’m not sure']],
  interventions: ['What did you try, in the order it happened?', ['Gentle verbal reminders', 'Explained expectations', 'Changed partners', 'Moved to another spot', 'Gave individual attention', 'Offered a short break', 'Let the dancer try again', 'Changed into school shoes', 'Returned to the classroom early'], true],
  response: ['How did the dancer respond?', ['Rejoined class successfully', 'Improved briefly', 'Continued struggling', 'Needed additional support', 'Returned to the classroom early']],
  impact: ['How did this affect the class or another dancer?', ['No one else was affected', 'Class was disrupted', 'Another dancer was upset', 'Physical contact occurred', 'Someone was injured']],
  tap_shoes: ['Did the dancer change into school shoes for safety?', ['Yes, and they continued participating', 'Yes, but the unsafe behavior continued', 'Yes, another outcome', 'No, we tried other redirection', 'No, a shoe change wasn’t needed']],
  shoe_outcome: ['What happened after the dancer changed shoes?', ['Participated successfully', 'Needed more reminders', 'Unsafe behavior continued', 'Returned to the classroom early']],
  objective: ['What would you like the family to take away?', ['Keep them informed', 'Offer reassurance', 'Ask for reinforcement at home', 'Work together on an ongoing concern', 'Explain a safety step', 'Explain the early classroom return']],
};
const toneOptions = { default: 'Dance Techniques', warmer: 'Warmer', concise: 'More concise', professional: 'More professional', reassuring: 'More reassuring', direct: 'More direct' };

export async function requestBehavior(client, body) {
  const { data, error } = await client.functions.invoke('dt-touch-rewrite', { body });
  if (error || !data?.ok) {
    let details = data;
    if (error?.context?.json) {
      try { details = await error.context.json(); } catch { /* Keep the default message. */ }
    }
    throw Error(details?.message || 'DT Touch could not finish. Your draft is unchanged.');
  }
  return data;
}

function element(tag, text, properties = {}) {
  const node = Object.assign(document.createElement(tag), properties);
  if (text) node.textContent = text;
  return node;
}

export function openBehaviorInterview({ plan, draft, generate, apply }) {
  const dialog = element('dialog', '', { className: 'dt-behavior-dialog' });
  const heading = element('h3', 'Let’s make sure we communicate this thoughtfully! 💕');
  heading.id = 'dt-behavior-heading';
  dialog.setAttribute('aria-labelledby', heading.id);
  const close = element('button', 'Close', { type: 'button', className: 'secondary' });
  close.onclick = () => dialog.close();
  const warning = element('p', 'Follow Dance Techniques incident reporting and notify your director when required.');
  warning.className = 'dt-behavior-warning';
  warning.hidden = !plan.incident_review;
  const original = element('details');
  original.append(element('summary', 'Original notes'), element('p', draft));
  const panel = element('section', '', { tabIndex: -1 });
  const status = element('p');
  status.setAttribute('role', 'status');
  dialog.append(close, heading, warning, original, panel, status);

  const answers = {};
  const selections = {};
  const custom = {};
  let index = 0;
  let tone = 'default';
  let output = '';
  const keys = () => {
    const base = (plan.questions || []).filter(key => questions[key]);
    if (!base.includes('shoe_outcome') && selections.tap_shoes?.includes('Yes, another outcome')) {
      base.splice(base.indexOf('tap_shoes') + 1, 0, 'shoe_outcome');
    }
    return base;
  };
  const action = (label, onClick, primary = false) => {
    const button = element('button', label, { type: 'button', className: primary ? 'primary' : 'secondary' });
    button.onclick = onClick;
    return button;
  };
  function render(moveFocus = true) {
    panel.replaceChildren();
    status.textContent = '';
    const active = keys();
    const key = active[index];
    if (!key) {
      const label = element('label', 'Tone ');
      const select = element('select');
      for (const [value, name] of Object.entries(toneOptions)) select.append(element('option', name, { value }));
      select.value = tone;
      select.onchange = () => { tone = select.value; };
      label.append(select);
      const result = element('textarea', '', { rows: 6, maxLength: 4000, value: output, hidden: !output });
      result.setAttribute('aria-label', 'Review and Edit Parent Message');
      result.oninput = () => { output = result.value; };
      const actions = element('div', '', { className: 'dt-behavior-actions' });
      const generateButton = action(output ? 'Regenerate Draft' : 'Generate Draft', async () => {
        panel.inert = true;
        status.textContent = 'Preparing your draft…';
        try {
          const { rewritten_text: message, incident_review: incidentReview } = await generate({ ...answers }, tone);
          if (!dialog.open) return;
          if (typeof message !== 'string' || !message.trim() || message.length > 4000) throw Error('DT Touch could not prepare a usable draft. Your notes are unchanged.');
          if (incidentReview) warning.hidden = false;
          output = message;
          render();
          status.textContent = 'Review and edit the draft before using it.';
        } catch (error) { status.textContent = error.message; }
        finally { panel.inert = false; }
      }, true);
      actions.append(generateButton);
      if (output) {
        actions.append(action('Copy Draft', async () => {
          try { await navigator.clipboard.writeText(result.value); status.textContent = 'Copied.'; }
          catch { result.focus(); result.select(); status.textContent = 'Draft selected. Use your device’s copy command.'; }
        }), action('Use This Draft', () => {
          if (!result.value.trim()) return;
          if (apply(result.value) === false) { status.textContent = 'Your original field changed. Copy this draft to keep it.'; return; }
          dialog.close();
        }));
      }
      if (active.length) actions.append(action('Back to Answers', () => { index = active.length - 1; render(); }));
      panel.append(label, result, actions);
      if (moveFocus) (output ? result : panel).focus();
      return;
    }
    const [question, options, multiple] = questions[key];
    const group = element('fieldset');
    group.append(element('legend', question));
    const chosen = selections[key] ?? [];
    const customInput = element('textarea', '', { rows: 2, maxLength: 500, value: custom[key] || '', placeholder: 'Other or additional details' });
    customInput.setAttribute('aria-label', 'Other or Additional Details');
    const choices = element('div', '', { className: 'dt-behavior-actions' });
    for (const option of options) {
      const button = action(option, () => {
        custom[key] = customInput.value;
        selections[key] = multiple
          ? chosen.includes(option) ? chosen.filter(value => value !== option) : [...chosen, option]
          : [option];
        render(false);
        [...panel.querySelectorAll('[aria-pressed]')].find(node => node.textContent === option)?.focus();
      });
      button.setAttribute('aria-pressed', String(chosen.includes(option)));
      choices.append(button);
    }
    const advance = skip => {
      if (skip) { delete selections[key]; delete answers[key]; delete custom[key]; }
      else {
        custom[key] = customInput.value.trim();
        answers[key] = [...chosen, custom[key]].filter(Boolean).join(' → ');
        if (answers[key].length > 750) { status.textContent = 'Please shorten your additional details.'; return; }
        if (key === 'impact' && chosen.includes('Someone was injured')) warning.hidden = false;
      }
      if (key === 'tap_shoes' && !selections[key]?.includes('Yes, another outcome') && !plan.questions.includes('shoe_outcome')) {
        delete selections.shoe_outcome;
        delete answers.shoe_outcome;
        delete custom.shoe_outcome;
      }
      output = '';
      index += 1;
      render();
    };
    const actions = element('div', '', { className: 'dt-behavior-actions' });
    if (index) actions.append(action('Back', () => { custom[key] = customInput.value; index -= 1; render(); }));
    actions.append(action('Skip', () => advance(true)), action('Continue', () => advance(false), true));
    group.append(choices, multiple ? element('small', 'Select in the order it happened.') : element('span'), customInput);
    panel.append(group, actions);
    if (moveFocus) { group.tabIndex = -1; group.focus(); }
  }
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  render(false);
  dialog.showModal();
}

window.DTBehaviorInterview = { requestBehavior, openBehaviorInterview };

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-help-interview]');
  if (!button || button.disabled) return;
  const form = button.closest('[data-help-from-home-draft]');
  const dancer = form.querySelector('[data-help-dancer]');
  const notes = form.querySelector('[data-help-notes]');
  const status = form.querySelector('[data-help-status]');
  const originalText = notes.value;
  const studentId = dancer.value;
  if (!studentId || !originalText.trim()) {
    status.textContent = 'Choose a dancer and add a few classroom notes first.';
    (studentId ? notes : dancer).focus();
    return;
  }
  const client = window.dtSupabase;
  if (!client || document.body.dataset.tourMode === 'true') {
    status.textContent = 'Sign in to Teacher Tools to generate a private draft.';
    return;
  }
  const unchanged = () => form.isConnected && dancer.value === studentId && notes.value === originalText;
  const request = behavior => requestBehavior(client, { originalText, studentId, behavior });
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  status.textContent = 'Preparing your interview…';
  try {
    const { interview } = await request({ phase: 'plan', manual: true });
    if (!unchanged()) throw Error('Your dancer or notes changed. Try again with the current draft.');
    if (!interview) throw Error('The classroom interview is unavailable. Your notes are unchanged.');
    status.textContent = '';
    openBehaviorInterview({
      plan: interview, draft: originalText,
      generate: async (answers, tone) => {
        if (!unchanged()) throw Error('Your dancer or notes changed. Reopen the interview.');
        return request({ phase: 'draft', answers, tone });
      },
      apply: message => {
        if (!unchanged()) return false;
        form.querySelector('[data-help-result]').value = message;
        form.querySelector('[data-help-result-wrap]').hidden = false;
        status.textContent = 'Private draft ready to review.';
        return true;
      },
    });
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});

document.addEventListener('change', event => {
  const field = event.target.closest('[data-help-dancer]');
  if (!field) return;
  const form = field.closest('[data-help-from-home-draft]');
  if (field.dataset.previousDancer) form.querySelector('[data-help-notes]').value = '';
  field.dataset.previousDancer = field.value;
  form.querySelector('[data-help-result]').value = '';
  form.querySelector('[data-help-result-wrap]').hidden = true;
  form.querySelector('[data-help-status]').textContent = '';
});
