frappe.provide("custom.pages");

frappe.pages["ticket-workspace"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Ticket Workspace",
    single_column: true,
  });

  // Top action buttons
  page.set_primary_action("Reply", () => openComposer("reply"));
  page.add_action_item("Add Note", () => openComposer("note"));
  page.add_action_item("Forward", () => openComposer("forward"));
  page.add_action_item("Close", () => applyWorkflowAction("Close"));

  const $wrapper = $(wrapper);
  $wrapper.addClass("ticket-workspace-page");

  $wrapper.find(".layout-main-section").html(`
    <div class="ticket-workspace">
      <div class="tw-header-bar">
        <div class="tw-breadcrumbs">Support / Issue / <span class="tw-ticket-subject">Loading...</span></div>
        <div class="tw-status-badge">Loading...</div>
      </div>

      <div class="tw-layout">
        <section class="tw-thread-panel">
          <div class="tw-thread-toolbar">
            <button class="btn btn-default btn-sm tw-refresh-btn">Refresh</button>
            <div class="tw-thread-meta"></div>
          </div>
          <div class="tw-thread-list"></div>
        </section>

        <aside class="tw-properties-panel">
          <div class="tw-card">
            <div class="tw-card-title">Properties</div>
            <div class="tw-field"><label>Status</label><select class="form-control tw-status"></select></div>
            <div class="tw-field"><label>Priority</label><select class="form-control tw-priority"></select></div>
            <div class="tw-field"><label>Type</label><input class="form-control tw-type" /></div>
            <div class="tw-field"><label>Group</label><input class="form-control tw-group" /></div>
            <div class="tw-field"><label>Agent</label><input class="form-control tw-agent" /></div>
            <button class="btn btn-primary btn-block tw-update-btn">Update</button>
          </div>
        </aside>

        <aside class="tw-sidebar-panel">
          <div class="tw-card">
            <div class="tw-card-title">Contact Details</div>
            <div class="tw-contact-name">Loading...</div>
            <div class="tw-contact-email text-muted"></div>
          </div>
          <div class="tw-card">
            <div class="tw-card-title">Timeline</div>
            <div class="tw-timeline"></div>
          </div>
        </aside>
      </div>
    </div>
  `);

  injectStyles();

  const route = frappe.get_route();
  const issue_name = route[1] || frappe.route_options?.issue;

  if (!issue_name) {
    frappe.msgprint("Open this page with a ticket name in the route, for example: /app/ticket-workspace/ISS-0001");
    return;
  }

  bindEvents($wrapper, issue_name);
  loadIssue($wrapper, issue_name);
};

function bindEvents($wrapper, issue_name) {
  $wrapper.on("click", ".tw-refresh-btn", () => loadIssue($wrapper, issue_name));
  $wrapper.on("click", ".tw-update-btn", () => updateIssue($wrapper, issue_name));
}

async function loadIssue($wrapper, issue_name) {
  try {
    const issue = await frappe.db.get_doc("Issue", issue_name);
    renderIssue($wrapper, issue);
    await loadCommunications($wrapper, issue_name);
    await loadTimeline($wrapper, issue_name);
  } catch (err) {
    console.error(err);
    frappe.msgprint({ title: "Error", message: "Could not load issue.", indicator: "red" });
  }
}

function renderIssue($wrapper, issue) {
  $wrapper.find(".tw-ticket-subject").text(issue.subject || issue.name);
  $wrapper.find(".tw-status-badge").text(issue.workflow_state || issue.status || "Open");
  $wrapper.find(".tw-thread-meta").text(`${issue.name} • ${issue.raised_by || "No email"}`);

  $wrapper.find(".tw-contact-name").text(issue.customer || issue.contact || "Unknown Customer");
  $wrapper.find(".tw-contact-email").text(issue.raised_by || "");

  const statuses = [
    "Open",
    "In Progress",
    "Waiting On Customer",
    "Ready to be Invoiced",
    "Closed",
  ];

  const priorities = ["Low", "Medium", "High", "Urgent"];

  setOptions($wrapper.find(".tw-status"), statuses, issue.workflow_state || issue.status);
  setOptions($wrapper.find(".tw-priority"), priorities, issue.priority);
  $wrapper.find(".tw-type").val(issue.issue_type || "");
  $wrapper.find(".tw-group").val(issue.custom_group || "");
  $wrapper.find(".tw-agent").val(issue.owner || "");
}

async function loadCommunications($wrapper, issue_name) {
  const response = await frappe.call({
    method: "frappe.client.get_list",
    args: {
      doctype: "Communication",
      fields: ["name", "sender", "content", "creation", "sent_or_received", "subject"],
      filters: {
        reference_doctype: "Issue",
        reference_name: issue_name,
      },
      order_by: "creation asc",
      limit_page_length: 100,
    },
  });

  const communications = response.message || [];
  const html = communications.length
    ? communications.map(renderCommunicationCard).join("")
    : `<div class="tw-empty">No messages yet.</div>`;

  $wrapper.find(".tw-thread-list").html(html);
}

function renderCommunicationCard(comm) {
  const directionClass = comm.sent_or_received === "Received" ? "incoming" : "outgoing";
  return `
    <article class="tw-message-card ${directionClass}">
      <div class="tw-message-head">
        <div class="tw-message-sender">${frappe.utils.escape_html(comm.sender || "System")}</div>
        <div class="tw-message-time text-muted">${frappe.datetime.str_to_user(comm.creation)}</div>
      </div>
      <div class="tw-message-subject">${frappe.utils.escape_html(comm.subject || "")}</div>
      <div class="tw-message-body">${comm.content || ""}</div>
    </article>
  `;
}

async function loadTimeline($wrapper, issue_name) {
  const timeline = [
    `<div class="tw-timeline-item"><strong>${issue_name}</strong> created</div>`,
  ];
  $wrapper.find(".tw-timeline").html(timeline.join(""));
}

async function updateIssue($wrapper, issue_name) {
  try {
    const values = {
      workflow_state: $wrapper.find(".tw-status").val(),
      priority: $wrapper.find(".tw-priority").val(),
      issue_type: $wrapper.find(".tw-type").val(),
      custom_group: $wrapper.find(".tw-group").val(),
      owner: $wrapper.find(".tw-agent").val(),
    };

    await frappe.db.set_value("Issue", issue_name, values);
    frappe.show_alert({ message: "Ticket updated", indicator: "green" });
    loadIssue($wrapper, issue_name);
  } catch (err) {
    console.error(err);
    frappe.msgprint({ title: "Update failed", message: "Could not update ticket.", indicator: "red" });
  }
}

function setOptions($el, options, selected) {
  $el.empty();
  options.forEach((option) => {
    const isSelected = option === selected ? "selected" : "";
    $el.append(`<option value="${frappe.utils.escape_html(option)}" ${isSelected}>${frappe.utils.escape_html(option)}</option>`);
  });
}

function openComposer(mode) {
  frappe.msgprint(`Open ${mode} composer here.`);
}

function applyWorkflowAction(action) {
  frappe.msgprint(`Trigger workflow action: ${action}`);
}

function injectStyles() {
  if (document.getElementById("ticket-workspace-styles")) return;

  const style = document.createElement("style");
  style.id = "ticket-workspace-styles";
  style.textContent = `
    .ticket-workspace-page .layout-main-section { padding: 0 !important; }
    .ticket-workspace { padding: 16px; background: #f5f7fb; min-height: calc(100vh - 90px); }
    .tw-header-bar {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px; gap: 12px;
    }
    .tw-breadcrumbs { font-size: 20px; font-weight: 600; color: #223; }
    .tw-status-badge {
      background: #eef2ff; color: #334; padding: 8px 14px; border-radius: 999px; font-weight: 600;
    }
    .tw-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.8fr) minmax(280px, 0.8fr) minmax(280px, 0.8fr);
      gap: 16px;
      align-items: start;
    }
    .tw-thread-panel, .tw-card {
      background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04);
    }
    .tw-thread-panel { padding: 16px; }
    .tw-thread-toolbar {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
    }
    .tw-message-card {
      border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin-bottom: 12px; background: #fff;
    }
    .tw-message-card.incoming { border-left: 4px solid #6b7280; }
    .tw-message-card.outgoing { border-left: 4px solid #94a3b8; background: #fafafa; }
    .tw-message-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; }
    .tw-message-sender { font-weight:600; }
    .tw-message-subject { font-size: 13px; color:#667085; margin-bottom:10px; }
    .tw-properties-panel, .tw-sidebar-panel { display:flex; flex-direction:column; gap:16px; }
    .tw-card { padding: 16px; }
    .tw-card-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #667085; margin-bottom: 12px; }
    .tw-field { margin-bottom: 12px; }
    .tw-field label { display:block; font-size:12px; color:#667085; margin-bottom:6px; }
    .tw-contact-name { font-weight: 700; font-size: 16px; margin-bottom: 4px; }
    .tw-timeline-item { padding: 10px 0; border-bottom: 1px solid #eef2f7; }
    .tw-empty { text-align:center; color:#667085; padding: 32px 16px; }
    @media (max-width: 1200px) {
      .tw-layout { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);
}
