import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { AlertTriangle, Wind as WindIcon, Scissors, Wand2, Users, Eye, X, Sparkles, Clapperboard, Plus, Trash2, Send, Check, Stethoscope, MessageSquare, Settings, Download, Upload, FilePlus, BookOpen } from "lucide-react";
import { llmComplete, DEFAULT_SETTINGS } from "./llm.js";

/* ============================ palette / config ============================ */
const PALETTE = {
  bg: "#13121b", panel: "#1a1925", panelEdge: "rgba(255,255,255,0.07)",
  ink: "#e8e3d6", inkMute: "#9b958a", inkFaint: "#6b665d",
  gold: "#d8a23e", teal: "#3fb6a0", violet: "#8a7fd6", coral: "#e0664a", ma: "#e8b04b",
};
const TYPE = {
  plot:  { accent: PALETTE.gold,   fill: "#23202c", label: "Main beat" },
  quest: { accent: PALETTE.teal,   fill: "#1c2725", label: "Personal quest" },
  lore:  { accent: PALETTE.violet, fill: "#23212e", label: "Lore" },
};
const EDGE_COLOR = { flow: PALETTE.gold, thread: PALETTE.teal, theme: PALETTE.violet };
const SIZE = { plot: { w: 158, h: 66 }, quest: { w: 150, h: 58 }, lore: { w: 140, h: 54 } };
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const SERIF = "'Iowan Old Style', Georgia, 'Times New Roman', serif";

const EXAMPLE = {
  nodes: [
    { id: "p1", type: "plot", label: "The Deck Found", seq: 1, tension: 0.5, summary: "The party recovers the corrupted Deck of Many Things.", notes: [] },
    { id: "p2", type: "plot", label: "Corruption Spreads", seq: 2, tension: 0.35, summary: "Blighted thickets creep across the Feywild.", notes: [] },
    { id: "p3", type: "plot", label: "The Enslaved Tribes", seq: 3, tension: 0.6, summary: "Fey tribes bound to serve the spreading rot.", notes: [] },
    { id: "p4", type: "plot", label: "Audience at the Seelie Court", seq: 4, tension: 0.7, summary: "The party answers for disrespecting the Queen.", notes: [] },
    { id: "p5", type: "plot", label: "The BBEG Revealed", seq: 5, tension: 0.95, summary: "The hand behind the Deck steps into the light.", notes: [] },
    { id: "p6", type: "plot", label: "The Quiet After", seq: 6, tension: 0.2, summary: "Smoke clears; the cost settles on the party.", notes: [] },
    { id: "p7", type: "plot", label: "The Last Draw", seq: 7, tension: 1.0, summary: "Final confrontation over the Deck's last card.", notes: [] },
    { id: "q1", type: "quest", owner: "Hermit", label: "Keeper of Terrible Truths", tension: 0.6, summary: "Hermit documents the corruption's true nature.", notes: [] },
    { id: "q2", type: "quest", owner: "Krark", label: "Unmake the Deck", tension: 0.5, summary: "Krark tries to reverse-engineer the artifact.", notes: [] },
    { id: "q3", type: "quest", owner: "Wind", label: "The Lost Stance", tension: 0.45, summary: "Wind seeks a technique only the Court remembers.", notes: [] },
    { id: "q4", type: "quest", owner: "Kruster", label: "Census of the Ice Isle", tension: 0.3, summary: "Kruster wants to count the penguins. All of them.", notes: [] },
  ],
  edges: [
    { id: "e1", from: "p1", to: "p2", type: "flow", why: "Recovering the Deck seeds the blight" },
    { id: "e2", from: "p2", to: "p3", type: "flow", why: "The rot reaches the fey tribes" },
    { id: "e3", from: "p3", to: "p4", type: "flow", why: "Freeing tribes draws the Court's eye" },
    { id: "e4", from: "p4", to: "p5", type: "flow", why: "The Court points to the true hand" },
    { id: "e5", from: "p5", to: "p6", type: "flow", why: "The reveal lands; the table breathes" },
    { id: "e6", from: "p6", to: "p7", type: "flow", why: "Resolve hardens into a final stand" },
    { id: "t1", from: "q1", to: "p2", type: "thread", why: "Hermit catalogues the first blight" },
    { id: "t2", from: "q1", to: "p3", type: "thread", why: "The tribes' truth is his to record" },
    { id: "t3", from: "q1", to: "p5", type: "thread", why: "He names the BBEG others won't" },
    { id: "t4", from: "q2", to: "p1", type: "thread", why: "Krark first studies the Deck here" },
    { id: "t5", from: "q2", to: "p5", type: "thread", why: "His counter-device meets its maker" },
    { id: "t6", from: "q3", to: "p4", type: "thread", why: "Only the Court remembers the stance" },
  ],
};

const WELCOME = { role: "assistant", text: "I can see your whole map — every beat, quest, and pipe. Ask me to draft read-aloud for a beat, write a scene, develop an NPC, or reshape the story, and I'll propose card edits you can apply. Try: “write the read-aloud for the BBEG reveal,” or “give Kruster a real reason to matter before act 3.”", ops: [] };

/* ============================ pure helpers ============================ */
function layout(nodes, edges) {
  const W = 1240, lanes = { plot: 96, lore: 232, quest: 372, bench: 540 };
  const plot = nodes.filter((n) => n.type === "plot").sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const lore = nodes.filter((n) => n.type === "lore");
  const connected = new Set(); edges.forEach((e) => { connected.add(e.from); connected.add(e.to); });
  const quests = nodes.filter((n) => n.type === "quest" && connected.has(n.id));
  const orphans = nodes.filter((n) => n.type === "quest" && !connected.has(n.id));
  const place = (arr, y, defW) => { const n = arr.length || 1, gap = (W - 120) / n; arr.forEach((node, i) => { const w = (SIZE[node.type] || { w: defW }).w; node.x = 60 + gap * i + (gap - w) / 2; node.y = y; }); };
  place(plot, lanes.plot, 158); place(lore, lanes.lore, 140);
  quests.forEach((node) => { const link = edges.find((e) => e.from === node.id && plot.find((p) => p.id === e.to)); const target = link && plot.find((p) => p.id === link.to); node.y = lanes.quest; node.x = target ? target.x + (SIZE.plot.w - SIZE.quest.w) / 2 : 60; });
  quests.sort((a, b) => a.x - b.x).forEach((node, i, a) => { if (i > 0 && node.x < a[i - 1].x + SIZE.quest.w + 16) node.x = a[i - 1].x + SIZE.quest.w + 16; });
  place(orphans, lanes.bench, 150);
  return [...plot, ...lore, ...quests, ...orphans].map((n) => ({ ...n, notes: n.notes || [] }));
}

function computeFlags(nodes, edges) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const plot = nodes.filter((n) => n.type === "plot").sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const quests = nodes.filter((n) => n.type === "quest");
  const maxSeq = plot.length ? plot[plot.length - 1].seq ?? plot.length : 0;
  const coverage = {};
  quests.forEach((q) => { const beats = edges.filter((e) => e.from === q.id && byId[e.to]?.type === "plot").map((e) => byId[e.to]).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)); coverage[q.id] = { owner: q.owner || q.label, label: q.label, summary: q.summary, beats }; });
  const forgotten = [], goingDark = [], thin = [];
  Object.entries(coverage).forEach(([id, c]) => {
    if (c.beats.length === 0) { forgotten.push({ id, ...c }); return; }
    const last = c.beats[c.beats.length - 1].seq ?? 0;
    if (maxSeq - last >= 3) goingDark.push({ id, ...c, lastBeat: c.beats[c.beats.length - 1] });
    if (c.beats.length === 1) thin.push({ id, ...c });
  });
  const ma = [], deadAir = [];
  plot.forEach((p, i) => {
    if ((p.tension ?? 0.5) > 0.35) return;
    const prev = plot[i - 1], peakBefore = prev && (prev.tension ?? 0) >= 0.66;
    const hasThread = edges.some((e) => e.to === p.id && byId[e.from]?.type === "quest");
    if (peakBefore) ma.push({ id: p.id, node: p, after: prev }); else if (!hasThread) deadAir.push({ id: p.id, node: p });
  });
  const cinematic = [];
  plot.forEach((p) => { const threads = edges.filter((e) => e.to === p.id && byId[e.from]?.type === "quest").map((e) => byId[e.from]); if (threads.length >= 2 || ((p.tension ?? 0) >= 0.7 && threads.length >= 1)) cinematic.push({ id: p.id, node: p, pcs: threads.map((t) => t.owner || t.label) }); });
  return { coverage, forgotten, goingDark, thin, ma, deadAir, cinematic };
}

function center(n) { const s = SIZE[n.type] || SIZE.quest; return { x: n.x + s.w / 2, y: n.y + s.h / 2 }; }
function pipePath(a, b) {
  const sa = SIZE[a.type] || SIZE.quest, sb = SIZE[b.type] || SIZE.quest, ca = center(a), cb = center(b); let start, end, vertical;
  if (Math.abs(ca.y - cb.y) < 50) { vertical = false; const ltr = ca.x <= cb.x; start = { x: a.x + (ltr ? sa.w : 0), y: ca.y }; end = { x: b.x + (ltr ? 0 : sb.w), y: cb.y }; }
  else { vertical = true; const above = cb.y < ca.y; start = { x: ca.x, y: a.y + (above ? 0 : sa.h) }; end = { x: cb.x, y: b.y + (above ? sb.h : 0) }; }
  const dx = end.x - start.x, dy = end.y - start.y;
  const c1 = vertical ? { x: start.x, y: start.y + dy * 0.5 } : { x: start.x + dx * 0.5, y: start.y };
  const c2 = vertical ? { x: end.x, y: end.y - dy * 0.5 } : { x: end.x - dx * 0.5, y: end.y };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
}
function tensionColor(t) {
  const v = Math.max(0, Math.min(1, t ?? 0.5)), stops = [[0, [63, 127, 182]], [0.5, [216, 162, 62]], [1, [224, 102, 74]]];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (v >= stops[i][0] && v <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; }
  const f = (v - lo[0]) / (hi[0] - lo[0] || 1), c = lo[1].map((x, i) => Math.round(x + (hi[1][i] - x) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function wrap(text, max) {
  const words = (text || "").split(" "), lines = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > max) { if (cur) lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); if (lines.length === 2) break; }
  if (cur && lines.length < 2) lines.push(cur);
  if (lines.length === 2 && words.join(" ").length > lines.join(" ").length) lines[1] = lines[1].replace(/.$/, "…");
  return lines.length ? lines : [text];
}
const coerceT = (t) => { let v = Number(t); if (isNaN(v)) v = 0.5; if (v > 1) v = v / 100; return Math.max(0, Math.min(1, v)); };
const extractJson = (text) => {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const s = t.indexOf("{");
  if (s < 0) return null;
  const e = t.lastIndexOf("}");
  if (e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* fall through */ } }
  // best-effort: slice to the last balanced close brace (handles trailing junk)
  let depth = 0, inStr = false, esc = false, lastValid = -1;
  for (let i = s; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; }
    else if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") { depth--; if (depth === 0) lastValid = i; }
  }
  if (lastValid > s) { try { return JSON.parse(t.slice(s, lastValid + 1)); } catch { /* */ } }
  return null;
};
const loadLS = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };

/* ============================ component ============================ */
export default function App() {
  const saved = loadLS("sp_map", null);
  const [nodes, setNodes] = useState(() => saved?.nodes ? saved.nodes.map((n) => ({ ...n, notes: n.notes || [] })) : []);
  const [edges, setEdges] = useState(() => saved?.edges || []);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...loadLS("sp_settings", {}) }));
  const [sel, setSel] = useState(null);
  const [focusPC, setFocusPC] = useState(null);
  const [showPaste, setShowPaste] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sugg, setSugg] = useState({});
  const [tab, setTab] = useState("write");
  const [conn, setConn] = useState({ to: "", type: "thread", why: "" });
  const [messages, setMessages] = useState([WELCOME]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const svgRef = useRef(null), drag = useRef(null), nid = useRef(1), fileRef = useRef(null);
  const newId = () => `n${Date.now().toString(36)}${nid.current++}`;

  useEffect(() => { try { localStorage.setItem("sp_map", JSON.stringify({ nodes, edges })); } catch (e) { /* quota */ } }, [nodes, edges]);
  useEffect(() => { try { localStorage.setItem("sp_settings", JSON.stringify(settings)); } catch (e) { /* */ } }, [settings]);

  const flags = useMemo(() => computeFlags(nodes, edges), [nodes, edges]);
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const candidateIds = useMemo(() => new Set(flags.cinematic.map((c) => c.id)), [flags]);
  const maxSeq = useMemo(() => Math.max(0, ...nodes.filter((n) => n.type === "plot").map((n) => n.seq ?? 0)), [nodes]);

  const pcs = useMemo(() => {
    const m = {}; nodes.filter((n) => n.type === "quest" && n.owner).forEach((n) => { m[n.owner] = 0; });
    Object.entries(flags.coverage).forEach(([id, c]) => { if (byId[id]?.owner) m[byId[id].owner] = c.beats.length; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [nodes, flags, byId]);

  const relatedToPC = useCallback((pc) => { if (!pc) return null; const qIds = nodes.filter((n) => n.type === "quest" && n.owner === pc).map((n) => n.id); const set = new Set(qIds); edges.forEach((e) => { if (qIds.includes(e.from)) { set.add(e.from); set.add(e.to); } }); return set; }, [nodes, edges]);
  const focusSet = relatedToPC(focusPC);
  const dimmed = (id) => focusSet && !focusSet.has(id);

  /* drag */
  const toSvg = (e) => { const svg = svgRef.current, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  const onDown = (e, n) => { e.stopPropagation(); const p = toSvg(e); drag.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y, moved: false }; };
  const onMove = (e) => { if (!drag.current) return; const p = toSvg(e); drag.current.moved = true; setNodes((ns) => ns.map((n) => n.id === drag.current.id ? { ...n, x: p.x - drag.current.dx, y: p.y - drag.current.dy } : n)); };
  const onUp = (e, n) => { if (drag.current && !drag.current.moved) { setSel({ kind: "node", id: n.id }); setConn({ to: "", type: n.type === "plot" ? "flow" : "thread", why: "" }); } drag.current = null; };

  /* mutations */
  const updateNode = (id, ch) => setNodes((ns) => ns.map((n) => n.id === id ? { ...n, ...ch } : n));
  const deleteNode = (id) => { setEdges((es) => es.filter((e) => e.from !== id && e.to !== id)); setNodes((ns) => ns.filter((n) => n.id !== id)); setSel(null); };
  const addPipe = (from, to, type, why) => { if (!from || !to || from === to) return; setEdges((es) => es.find((e) => e.from === from && e.to === to) ? es : [...es, { id: newId(), from, to, type: type || "thread", why: why || "" }]); };
  const severEdge = (id) => setEdges((es) => es.filter((e) => e.id !== id));
  const placeFor = (type, ns) => { const w = (SIZE[type] || SIZE.quest).w, lane = type === "plot" ? 96 : type === "lore" ? 232 : 372; const rightmost = ns.filter((n) => n.type === type).reduce((m, n) => Math.max(m, n.x + (SIZE[n.type] || SIZE.quest).w), 40); return { x: Math.min(rightmost + 24, 1240 - w - 20), y: lane }; };
  const addCard = (type = "plot") => {
    const id = newId(); const pos = placeFor(type, nodes);
    const card = { id, type, label: type === "plot" ? "New beat" : type === "quest" ? "New quest" : "New lore", summary: "", notes: [], ...pos };
    if (type === "plot") { card.seq = maxSeq + 1; card.tension = 0.5; } if (type === "quest") card.owner = "";
    setNodes((ns) => [...ns, card]); setSel({ kind: "node", id }); setConn({ to: "", type: type === "plot" ? "flow" : "thread", why: "" });
  };
  const loadExample = () => { setNodes(layout(structuredClone(EXAMPLE.nodes), EXAMPLE.edges)); setEdges(EXAMPLE.edges); setSel(null); setFocusPC(null); setSugg({}); setErr(""); };
  const newMap = () => { if (!confirm("Clear the whole map? (Export first if you want to keep it.)")) return; setNodes([]); setEdges([]); setSel(null); setFocusPC(null); setSugg({}); setMessages([WELCOME]); };

  /* export / import */
  const exportMap = () => {
    const blob = new Blob([JSON.stringify({ version: 1, app: "dnd-story-pipes", nodes, edges }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "story-pipes-map.json"; a.click(); URL.revokeObjectURL(url);
  };
  const importMap = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { const data = JSON.parse(reader.result); if (!Array.isArray(data.nodes)) throw new Error(); setNodes(data.nodes.map((n) => ({ ...n, notes: n.notes || [] }))); setEdges(data.edges || []); setSel(null); setFocusPC(null); setSugg({}); } catch { alert("That doesn't look like a Story Pipes map file."); } };
    reader.readAsText(file); e.target.value = "";
  };

  /* shared serializer */
  const serialize = useCallback(() => {
    const plot = nodes.filter((n) => n.type === "plot").sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const note = (n) => (n.notes && n.notes.length) ? ` | attached: ${n.notes.map((x) => `${x.title}: ${(x.body || "").slice(0, 140)}`).join(" / ")}` : "";
    const lines = ["BEATS (main story):"];
    plot.forEach((p) => lines.push(`  ${p.id} [seq ${p.seq}, tension ${Math.round((p.tension ?? 0) * 100)}/100] ${p.label} — ${p.summary}${note(p)}`));
    lines.push("PERSONAL QUESTS:");
    nodes.filter((n) => n.type === "quest").forEach((q) => { const conv = edges.filter((e) => e.from === q.id && byId[e.to]?.type === "plot").map((e) => byId[e.to].label); lines.push(`  ${q.id} (${q.owner || "?"}) "${q.label}" — ${q.summary} — converges on: ${conv.length ? conv.join("; ") : "NOTHING"}${note(q)}`); });
    const lore = nodes.filter((n) => n.type === "lore"); if (lore.length) { lines.push("LORE:"); lore.forEach((l) => lines.push(`  ${l.id} ${l.label} — ${l.summary}${note(l)}`)); }
    lines.push("PIPES:"); edges.forEach((e) => lines.push(`  ${e.from} -> ${e.to} (${e.type}): ${e.why}`));
    if (sel?.kind === "node") lines.push(`CURRENTLY SELECTED: ${sel.id}`);
    return lines.join("\n");
  }, [nodes, edges, byId, sel]);

  /* suggestion engine */
  const askSuggest = useCallback(async (key, opportunity) => {
    setSugg((s) => ({ ...s, [key]: { loading: true, items: null, error: "" } }));
    const sys = `You are a Dungeon Master's story consultant reading a campaign map. Given the full map and ONE opportunity, propose 2-3 concrete, table-ready moves. Ground EVERY move in the named beats and characters — name them. Be specific (a scene, a reveal, a line), never generic. Respect tension: reveals on high beats; a breath (Ma) belongs in a trough and should be protected. Return ONLY raw JSON, no markdown: {"suggestions":[{"title":"4-7 words","detail":"<=40 words"}]}`;
    try {
      const text = await llmComplete({ system: sys, messages: [{ role: "user", content: `CAMPAIGN MAP:\n${serialize()}\n\nOPPORTUNITY:\n${opportunity}` }], maxTokens: 1500 }, settings);
      const parsed = extractJson(text);
      if (!parsed?.suggestions?.length) throw new Error();
      setSugg((st) => ({ ...st, [key]: { loading: false, items: parsed.suggestions, error: "" } }));
    } catch (e) { setSugg((st) => ({ ...st, [key]: { loading: false, items: null, error: e.message || "Request failed." } })); }
  }, [serialize, settings]);

  /* parser */
  const mapIt = async () => {
    if (!draft.trim()) return; setLoading(true); setErr("");
    const sys = `You turn a campaign brief or world bible into a STORY GRAPH. Return ONLY raw JSON — no prose, no code fences.
Schema: {"nodes":[{"id","type":"plot|quest|lore","label","owner"(quest only = the PC's name),"seq"(plot only, integer story order from 1),"tension"(0..1),"summary":"<=20 words"}],"edges":[{"from","to","type":"flow|thread|theme","why":"<=12 words"}]}
Build a focused spine, not an index of every detail:
- plot = the campaign's main beats in story order. If the source has no explicit order, INFER a sensible act sequence starting from the inciting incident.
- quest = ONE node per player character, owner = that PC's name, summarizing what they personally want.
- lore = only the few major factions / villains / forces that matter to the spine.
- flow = plot beat -> next plot beat. thread = a PC quest converging on a plot beat. theme = lore tied to a beat.
Infer thread/theme links including thematic ones, but if a PC goal connects to nothing yet, leave it with NO edges. Aim for ~6-10 beats, one quest per PC, a few lore nodes. Keep summaries tight so the JSON stays complete.`;
    let text = "";
    try {
      text = await llmComplete({ system: sys, messages: [{ role: "user", content: draft.trim() }], maxTokens: 8000 }, settings);
      const parsed = extractJson(text);
      if (!parsed) throw new Error(text.trim() ? "unparseable" : "empty");
      if (!parsed.nodes?.length) throw new Error("nonodes");
      const ids = new Set(parsed.nodes.map((n) => n.id));
      const clean = (parsed.edges || []).filter((e) => ids.has(e.from) && ids.has(e.to)).map((e, i) => ({ ...e, id: e.id || `x${i}` }));
      setNodes(layout(parsed.nodes, clean)); setEdges(clean); setSel(null); setFocusPC(null); setSugg({}); setShowPaste(false);
    } catch (e) {
      if (text) console.error("Story Pipes — raw model output:\n", text);
      const m = e.message || "";
      if (m.includes("key") || m.includes("Ollama") || m.includes("Anthropic") || m.includes("Request failed")) setErr(m + " — a long brief can exceed the function timeout; shorten it or retry.");
      else if (m === "empty") setErr("The model returned nothing — likely a serverless timeout on a long brief. Shorten it, raise the function timeout, or retry.");
      else if (m === "unparseable") setErr("The reply wasn't complete JSON — usually the output was cut off. Shorten or split the brief, then retry (raw output is in the console).");
      else if (m === "nonodes") setErr("Parsed, but found no story beats. Add an explicit sequence of main beats (inciting incident + a few acts) and retry.");
      else setErr("Couldn't parse that into a map — see the browser console for the raw output.");
    } finally { setLoading(false); }
  };

  /* writing partner */
  const sendChat = async () => {
    const text = chatInput.trim(); if (!text || chatLoading) return;
    const prior = messages.filter((m) => m.role === "user" || m.role === "assistant");
    setMessages((ms) => [...ms, { role: "user", text }]); setChatInput(""); setChatLoading(true);
    let hist = prior.slice(); while (hist.length && hist[0].role !== "user") hist = hist.slice(1);
    const apiMsgs = [...hist.map((m) => ({ role: m.role, content: m.text })), { role: "user", content: text }];
    const sys = `You are a collaborative writing partner for a Dungeon Master — pair-programming, but for story. You see the DM's ENTIRE campaign map (below) and help shape and write it. You do two things: (1) WRITE — read-aloud boxes, scenes, NPC dialogue, beat or character development, grounded in the map; and (2) PROPOSE map changes the DM applies — never change anything silently.
Respect the map's logic: the tension curve (peaks vs. Ma breaths), convergence points where personal threads meet the trunk, and who is woven in vs. forgotten. When writing a beat, use the threads and characters that actually converge there.
Reply conversationally first, then attach ops only when they genuinely help. Use the EXACT ids shown. For edit_card / add_pipe / write-target, reference existing ids; for add_card, omit id.
Return ONLY raw JSON, no markdown: {"reply":"message (use \\n for paragraphs)","ops":[...]}
op kinds:
{"kind":"add_card","card":{"type":"plot|quest|lore","label":"","owner":"(quest)","seq":int(plot),"tension":0..1,"summary":""}}
{"kind":"edit_card","id":"existing id","changes":{label?,owner?,seq?,tension?,summary?}}
{"kind":"add_pipe","from":"id","to":"id","type":"flow|thread|theme","why":"<=12 words"}
{"kind":"write","target":"existing id or null","title":"short","body":"prose; may be several paragraphs with \\n"}

CURRENT MAP:
${serialize()}`;
    try {
      const raw = await llmComplete({ system: sys, messages: apiMsgs, maxTokens: 2200 }, settings);
      const p = extractJson(raw);
      const reply = p?.reply || raw, ops = Array.isArray(p?.ops) ? p.ops : [];
      setMessages((ms) => [...ms, { role: "assistant", text: reply, ops }]);
    } catch (e) { setMessages((ms) => [...ms, { role: "assistant", text: e.message || "Something went wrong reaching the model — check Settings and try again.", ops: [] }]); } finally { setChatLoading(false); }
  };

  const markApplied = (mi, oi) => setMessages((ms) => ms.map((m, i) => i !== mi ? m : { ...m, ops: m.ops.map((o, j) => j === oi ? { ...o, applied: true } : o) }));
  const applyOp = (mi, oi) => {
    const op = messages[mi].ops[oi]; if (!op || op.applied) return;
    if (op.kind === "add_card") {
      const c = op.card || {}, type = ["plot", "quest", "lore"].includes(c.type) ? c.type : "plot", id = newId();
      setNodes((ns) => { const pos = placeFor(type, ns); const node = { id, type, label: c.label || "New card", summary: c.summary || "", notes: [], ...pos }; if (type === "plot") { node.seq = c.seq ?? (Math.max(0, ...ns.filter((n) => n.type === "plot").map((n) => n.seq ?? 0)) + 1); node.tension = coerceT(c.tension); } if (type === "quest") node.owner = c.owner || ""; return [...ns, node]; });
    } else if (op.kind === "edit_card") { const ch = { ...(op.changes || {}) }; if ("tension" in ch) ch.tension = coerceT(ch.tension); if ("seq" in ch) ch.seq = Number(ch.seq); updateNode(op.id, ch); }
    else if (op.kind === "add_pipe") { addPipe(op.from, op.to, op.type, op.why); }
    else if (op.kind === "write" && op.target) { setNodes((ns) => ns.map((n) => n.id === op.target ? { ...n, notes: [...(n.notes || []), { title: op.title || "Passage", body: op.body || "" }] } : n)); }
    markApplied(mi, oi);
  };

  const selNode = sel?.kind === "node" ? byId[sel.id] : null;
  const selEdge = sel?.kind === "edge" ? edges.find((e) => e.id === sel.id) : null;
  const selPipes = selNode ? edges.filter((e) => e.from === selNode.id || e.to === selNode.id) : [];
  const VIEW_H = 600;
  const modelLabel = settings.provider === "ollama" ? settings.ollamaModel : settings.claudeModel;
  const providerBadge = `${settings.provider === "ollama" ? "Ollama" : "Claude"} · ${modelLabel || "server default"}`;

  return (
    <div style={{ background: PALETTE.bg, color: PALETTE.ink, fontFamily: MONO, borderRadius: 14, overflow: "hidden", border: `1px solid ${PALETTE.panelEdge}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${PALETTE.panelEdge}`, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={18} color={PALETTE.gold} />
          <span style={{ fontFamily: SERIF, fontSize: 19, letterSpacing: 0.3 }}>DnD Story Pipes</span>
          <span style={{ color: PALETTE.inkFaint, fontSize: 11.5 }}>{providerBadge}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => addCard("plot")} style={btn(PALETTE.gold, true)}><Plus size={14} /> Card</button>
          <button onClick={() => setShowPaste((v) => !v)} style={btn(PALETTE.teal)}><Wand2 size={14} /> {showPaste ? "Close" : "Map campaign"}</button>
          <button onClick={loadExample} style={btn(PALETTE.inkMute, true)}><BookOpen size={14} /> Example</button>
          <button onClick={exportMap} style={btn(PALETTE.inkMute, true)}><Download size={14} /></button>
          <button onClick={() => fileRef.current?.click()} style={btn(PALETTE.inkMute, true)}><Upload size={14} /></button>
          <button onClick={newMap} style={btn(PALETTE.inkMute, true)}><FilePlus size={14} /></button>
          <button onClick={() => setShowSettings((v) => !v)} style={btn(PALETTE.inkMute, true)}><Settings size={14} /></button>
          <input ref={fileRef} type="file" accept="application/json" onChange={importMap} style={{ display: "none" }} />
        </div>
      </div>

      {showSettings && (
        <div style={{ padding: 16, borderBottom: `1px solid ${PALETTE.panelEdge}`, background: PALETTE.panel }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: PALETTE.inkMute, marginBottom: 10 }}>Model provider</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Chip active={settings.provider === "claude"} onClick={() => setSettings({ ...settings, provider: "claude" })}>Claude (API)</Chip>
            <Chip active={settings.provider === "ollama"} onClick={() => setSettings({ ...settings, provider: "ollama" })}>Ollama (local)</Chip>
          </div>
          {settings.provider === "claude" ? (
            <Field label="Model — blank uses the server's ANTHROPIC_MODEL"><input value={settings.claudeModel} onChange={(e) => setSettings({ ...settings, claudeModel: e.target.value })} placeholder="e.g. claude-sonnet-4-6 (or leave blank)" style={fld()} /></Field>
          ) : (
            <Field label="Model — blank uses the server's OLLAMA_MODEL"><input value={settings.ollamaModel} onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })} placeholder="e.g. gpt-oss:120b-cloud (or leave blank)" style={fld()} /></Field>
          )}
          <div style={{ fontSize: 11.5, color: PALETTE.inkFaint, marginTop: 12, lineHeight: 1.5 }}>
            Both providers are proxied through your serverless function using server-side env vars — <code style={{ color: PALETTE.inkMute }}>ANTHROPIC_API_KEY</code>/<code style={{ color: PALETTE.inkMute }}>ANTHROPIC_MODEL</code> for Claude, <code style={{ color: PALETTE.inkMute }}>OLLAMA_API_KEY</code>/<code style={{ color: PALETTE.inkMute }}>OLLAMA_MODEL</code> for Ollama Cloud. A model set above overrides the env default for this browser; leave it blank to use the env value. No keys are stored in the browser.
          </div>
        </div>
      )}

      {showPaste && (
        <div style={{ padding: 14, borderBottom: `1px solid ${PALETTE.panelEdge}`, background: PALETTE.panel }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Dump it raw: plot, BBEG, twists, and each PC + what they want. No stats." style={inp(110)} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <button onClick={mapIt} disabled={loading} style={{ ...btn(PALETTE.gold), opacity: loading ? 0.6 : 1 }}>{loading ? "Mapping…" : "Map it"}</button>
            {err && <span style={{ color: PALETTE.coral, fontSize: 12.5 }}>{err}</span>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {/* canvas */}
        <div style={{ flex: "1 1 540px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 11.5, color: PALETTE.inkMute, flexWrap: "wrap" }}>
            <Eye size={13} /><span>Focus:</span>
            <Chip active={!focusPC} onClick={() => setFocusPC(null)}>Everyone</Chip>
            {pcs.map(([pc]) => <Chip key={pc} active={focusPC === pc} onClick={() => setFocusPC(focusPC === pc ? null : pc)}>{pc}</Chip>)}
          </div>
          <svg ref={svgRef} viewBox={`0 0 1240 ${VIEW_H}`} width="100%" style={{ display: "block", touchAction: "none", cursor: drag.current ? "grabbing" : "default" }} onMouseMove={onMove} onMouseUp={() => (drag.current = null)} onMouseLeave={() => (drag.current = null)} onClick={() => setSel(null)}>
            <defs>
              <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#ffffff" strokeOpacity="0.035" strokeWidth="1" /></pattern>
              <marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1 L8 5 L2 9" fill="none" stroke="context-stroke" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></marker>
            </defs>
            <rect x="0" y="0" width="1240" height={VIEW_H} fill="url(#grid)" />
            {nodes.length === 0 && <text x="620" y={VIEW_H / 2} textAnchor="middle" fill={PALETTE.inkFaint} fontSize="14" fontFamily={MONO}>Empty canvas — add a card, map a campaign, or load the example.</text>}
            <line x1="40" y1="510" x2="1200" y2="510" stroke={PALETTE.coral} strokeOpacity="0.3" strokeDasharray="6 6" />
            <text x="48" y="503" fill={PALETTE.coral} fontSize="11" fontFamily={MONO} opacity="0.75">off the map — needs a bridge in</text>
            {edges.map((e) => {
              const a = byId[e.from], b = byId[e.to]; if (!a || !b) return null;
              const d = pipePath(a, b), col = EDGE_COLOR[e.type] || PALETTE.inkMute;
              const lit = sel?.kind === "node" && (sel.id === e.from || sel.id === e.to), off = dimmed(e.from) || dimmed(e.to), isSel = selEdge?.id === e.id;
              return (<g key={e.id} opacity={off ? 0.12 : 1}>
                <path d={d} fill="none" stroke="transparent" strokeWidth="14" style={{ cursor: "pointer" }} onClick={(ev) => { ev.stopPropagation(); setSel({ kind: "edge", id: e.id }); }} />
                <path d={d} fill="none" stroke={col} strokeWidth={isSel ? 3.2 : lit ? 2.6 : 1.8} strokeOpacity={isSel || lit ? 1 : 0.55} markerEnd="url(#ah)" strokeLinecap="round" />
              </g>);
            })}
            {nodes.map((n) => {
              const s = SIZE[n.type] || SIZE.quest, t = TYPE[n.type] || TYPE.quest;
              const orphan = n.type === "quest" && !edges.some((e) => e.from === n.id || e.to === n.id);
              const accent = orphan ? PALETTE.coral : t.accent, selected = selNode?.id === n.id, off = dimmed(n.id), isCand = candidateIds.has(n.id);
              const lines = wrap(n.label, n.type === "plot" ? 19 : 18), hasNotes = (n.notes || []).length > 0;
              return (<g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={off ? 0.2 : 1} style={{ cursor: "grab" }} onMouseDown={(e) => onDown(e, n)} onMouseUp={(e) => { e.stopPropagation(); onUp(e, n); }}>
                <rect width={s.w} height={s.h} rx="9" fill={t.fill} stroke={selected ? accent : isCand ? PALETTE.ma : PALETTE.panelEdge} strokeWidth={selected || isCand ? 1.6 : 1} />
                <rect width="4" height={s.h} rx="2" fill={accent} />
                {n.type === "quest" && n.owner && <text x="14" y="18" fill={accent} fontSize="10.5" fontFamily={MONO} style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>{n.owner}</text>}
                {lines.map((ln, i) => <text key={i} x="14" y={(n.type === "quest" && n.owner ? 34 : 26) + i * 15} fill={PALETTE.ink} fontSize="12.5" fontFamily={n.type === "plot" ? SERIF : MONO}>{ln}</text>)}
                {n.type === "plot" && <>
                  <rect x="14" y={s.h - 14} width={s.w - 50} height="4" rx="2" fill="#ffffff" fillOpacity="0.08" />
                  <rect x="14" y={s.h - 14} width={(s.w - 50) * (n.tension ?? 0.5)} height="4" rx="2" fill={tensionColor(n.tension)} />
                  <text x={s.w - 30} y={s.h - 10} fill={PALETTE.inkFaint} fontSize="9.5" fontFamily={MONO}>{Math.round((n.tension ?? 0) * 100)}</text>
                  {n.seq != null && <text x={s.w - 16} y="16" fill={PALETTE.inkFaint} fontSize="10" fontFamily={MONO}>{n.seq}</text>}
                  {isCand && <Clapperboard x={9} y={6} width={13} height={13} color={PALETTE.ma} />}
                </>}
                {orphan && <AlertTriangle x={s.w - 22} y={6} width={14} height={14} color={PALETTE.coral} />}
                {hasNotes && <circle cx={s.w - 9} cy={s.h - 9} r="3.4" fill={PALETTE.teal} />}
              </g>);
            })}
          </svg>
          <div style={{ padding: "6px 14px 12px", fontSize: 11, color: PALETTE.inkFaint, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <Legend c={PALETTE.gold}>beat</Legend><Legend c={PALETTE.teal}>quest</Legend><Legend c={PALETTE.coral}>orphan</Legend>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Clapperboard size={12} color={PALETTE.ma} /> cinematic</span>
            <span>click a card to edit · drag to move · click a pipe for its reason</span>
          </div>
        </div>

        {/* right panel */}
        <div style={{ flex: "1 1 360px", minWidth: 300, borderLeft: `1px solid ${PALETTE.panelEdge}`, background: PALETTE.panel, maxHeight: VIEW_H + 110, overflowY: "auto" }}>
          {selNode && (
            <div style={{ padding: 14, borderBottom: `1px solid ${PALETTE.panelEdge}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, color: PALETTE.inkMute }}>Edit card</span>
                <X size={15} color={PALETTE.inkFaint} style={{ cursor: "pointer" }} onClick={() => setSel(null)} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <select value={selNode.type} onChange={(e) => updateNode(selNode.id, { type: e.target.value })} style={fld(96)}>
                  <option value="plot">Main beat</option><option value="quest">Quest</option><option value="lore">Lore</option>
                </select>
                {selNode.type === "plot" && <input type="number" value={selNode.seq ?? ""} onChange={(e) => updateNode(selNode.id, { seq: Number(e.target.value) })} placeholder="seq" style={fld(64)} />}
                {selNode.type === "quest" && <input value={selNode.owner ?? ""} onChange={(e) => updateNode(selNode.id, { owner: e.target.value })} placeholder="owner (PC)" style={fld()} />}
              </div>
              <input value={selNode.label ?? ""} onChange={(e) => updateNode(selNode.id, { label: e.target.value })} placeholder="title" style={{ ...fld(), marginBottom: 8, width: "100%" }} />
              <textarea value={selNode.summary ?? ""} onChange={(e) => updateNode(selNode.id, { summary: e.target.value })} placeholder="summary — the richer this is, the sharper the writing partner" style={{ ...inp(56), marginBottom: 8 }} />
              {selNode.type === "plot" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 12, color: PALETTE.inkMute }}>
                  <span>tension</span>
                  <input type="range" min="0" max="1" step="0.05" value={selNode.tension ?? 0.5} onChange={(e) => updateNode(selNode.id, { tension: Number(e.target.value) })} style={{ flex: 1 }} />
                  <span style={{ color: tensionColor(selNode.tension), width: 26, textAlign: "right" }}>{Math.round((selNode.tension ?? 0) * 100)}</span>
                </div>
              )}
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, color: PALETTE.inkMute, margin: "4px 0 6px" }}>Pipes</div>
              {selPipes.map((e) => { const other = e.from === selNode.id ? byId[e.to] : byId[e.from]; return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: EDGE_COLOR[e.type] }}>{e.from === selNode.id ? "→" : "←"}</span>
                  <span style={{ flex: 1, color: PALETTE.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{other?.label || "?"}</span>
                  <Scissors size={13} color={PALETTE.coral} style={{ cursor: "pointer" }} onClick={() => severEdge(e.id)} />
                </div>); })}
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <select value={conn.to} onChange={(e) => setConn({ ...conn, to: e.target.value })} style={fld()}>
                  <option value="">connect to…</option>
                  {nodes.filter((n) => n.id !== selNode.id).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
                <select value={conn.type} onChange={(e) => setConn({ ...conn, type: e.target.value })} style={fld(86)}>
                  <option value="flow">flow</option><option value="thread">thread</option><option value="theme">theme</option>
                </select>
                <button onClick={() => { if (conn.to) { addPipe(selNode.id, conn.to, conn.type, conn.why); setConn({ ...conn, to: "", why: "" }); } }} style={btn(PALETTE.teal, true)}><Plus size={13} /></button>
              </div>
              {(selNode.notes || []).length > 0 && <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, color: PALETTE.inkMute, margin: "12px 0 6px" }}>Attached writing</div>}
              {(selNode.notes || []).map((nt, i) => (
                <div key={i} style={{ background: "#ffffff0a", borderRadius: 8, padding: "8px 10px", marginBottom: 6, borderLeft: `2px solid ${PALETTE.teal}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: PALETTE.teal }}>{nt.title}</span>
                    <Trash2 size={12} color={PALETTE.inkFaint} style={{ cursor: "pointer" }} onClick={() => updateNode(selNode.id, { notes: selNode.notes.filter((_, j) => j !== i) })} />
                  </div>
                  <div style={{ fontSize: 12.5, color: PALETTE.ink, fontFamily: SERIF, lineHeight: 1.55, marginTop: 4, whiteSpace: "pre-wrap" }}>{nt.body}</div>
                </div>
              ))}
              <button onClick={() => deleteNode(selNode.id)} style={{ ...btn(PALETTE.coral, true), marginTop: 10 }}><Trash2 size={13} /> Delete card</button>
            </div>
          )}
          {selEdge && !selNode && (
            <div style={{ padding: 14, borderBottom: `1px solid ${PALETTE.panelEdge}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, color: PALETTE.inkMute }}>Pipe</span><X size={15} color={PALETTE.inkFaint} style={{ cursor: "pointer" }} onClick={() => setSel(null)} /></div>
              <div style={{ fontFamily: SERIF, fontSize: 15, margin: "6px 0", color: EDGE_COLOR[selEdge.type] }}>{byId[selEdge.from]?.label} → {byId[selEdge.to]?.label}</div>
              <p style={{ color: PALETTE.inkMute, fontSize: 13, fontStyle: "italic" }}>“{selEdge.why}”</p>
              <button onClick={() => { severEdge(selEdge.id); setSel(null); }} style={{ ...btn(PALETTE.coral, true), marginTop: 4 }}><Scissors size={13} /> Sever</button>
            </div>
          )}

          <div style={{ display: "flex", borderBottom: `1px solid ${PALETTE.panelEdge}` }}>
            <Tab active={tab === "write"} onClick={() => setTab("write")} icon={<MessageSquare size={14} />}>Write</Tab>
            <Tab active={tab === "doctor"} onClick={() => setTab("doctor")} icon={<Stethoscope size={14} />}>Doctor</Tab>
          </div>

          {tab === "write" ? (
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
                {messages.map((m, mi) => (
                  <div key={mi}>
                    <div style={{ background: m.role === "user" ? PALETTE.teal + "1c" : "#ffffff08", border: `1px solid ${m.role === "user" ? PALETTE.teal + "44" : PALETTE.panelEdge}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", fontFamily: m.role === "assistant" ? SERIF : MONO, color: PALETTE.ink }}>{m.text}</div>
                    {m.ops && m.ops.map((op, oi) => <OpCard key={oi} op={op} byId={byId} onApply={() => applyOp(mi, oi)} />)}
                  </div>
                ))}
                {chatLoading && <div style={{ fontSize: 12.5, color: PALETTE.inkFaint, fontStyle: "italic" }}>writing…</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }} placeholder="Ask for a scene, read-aloud, an NPC, or a story fix…" style={inp(52)} />
                <button onClick={sendChat} disabled={chatLoading} style={{ ...btn(PALETTE.gold), alignSelf: "stretch", opacity: chatLoading ? 0.6 : 1 }}><Send size={15} /></button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 14 }}>
              <SectionTitle icon={<Clapperboard size={14} color={PALETTE.ma} />}>Cinematic candidates</SectionTitle>
              {flags.cinematic.length === 0 && <Empty>No convergence points yet.</Empty>}
              {flags.cinematic.map((c) => { const k = `cine:${c.id}`, opp = `A CINEMATIC CANDIDATE. Beat "${c.node.label}" (tension ${Math.round((c.node.tension ?? 0) * 100)}/100, ${c.node.summary}) is where these arcs converge: ${c.pcs.join(", ")}. Propose how to make it land — flashback, reveal, or Ma beat — using these characters. If the next beat is a lull, say what to protect.`; return (
                <FlagCard key={k} c={PALETTE.ma} title={`“${c.node.label}” — ${c.pcs.join(" + ")}`} onClick={() => setSel({ kind: "node", id: c.id })}>Threads converge on a {Math.round((c.node.tension ?? 0) * 100)}-tension beat. Prime spot for a flashback or reveal.<Suggest state={sugg[k]} onAsk={(e) => { e.stopPropagation(); askSuggest(k, opp); }} /></FlagCard>); })}

              <SectionTitle icon={<AlertTriangle size={14} color={PALETTE.coral} />}>Who's about to feel forgotten</SectionTitle>
              {flags.forgotten.length === 0 && flags.goingDark.length === 0 && <Empty>Everyone's woven in.</Empty>}
              {flags.forgotten.map((f) => { const k = `forg:${f.id}`, opp = `A FORGOTTEN CHARACTER. ${f.owner}'s quest "${f.label}" (${f.summary}) connects to NO main beat. Propose concrete ways to braid it into the existing trunk. Do not suggest cutting it.`; return (
                <FlagCard key={k} c={PALETTE.coral} title={`${f.owner} — off the map`} onClick={() => setSel({ kind: "node", id: f.id })}>“{f.label}” touches no main beat — a prompt to braid it in, not to cut it.<Suggest state={sugg[k]} onAsk={(e) => { e.stopPropagation(); askSuggest(k, opp); }} /></FlagCard>); })}
              {flags.goingDark.map((f) => { const k = `dark:${f.id}`, opp = `${f.owner} last appears at "${f.lastBeat.label}" (beat ${f.lastBeat.seq}) and is absent through the finale. Quest: "${f.label}" (${f.summary}). Propose late threads pulling ${f.owner} into the climax.`; return (
                <FlagCard key={k} c={PALETTE.coral} title={`${f.owner} — goes dark for the finale`} onClick={() => setSel({ kind: "node", id: f.id })}>Last seen at “{f.lastBeat.label},” then nothing through the climax.<Suggest state={sugg[k]} onAsk={(e) => { e.stopPropagation(); askSuggest(k, opp); }} /></FlagCard>); })}

              <SectionTitle icon={<WindIcon size={14} color={PALETTE.ma} />}>Breath vs. dead air</SectionTitle>
              {flags.ma.length === 0 && flags.deadAir.length === 0 && <Empty>No quiet stretches flagged.</Empty>}
              {flags.ma.map((m) => { const k = `ma:${m.id}`, opp = `Beat "${m.node.label}" (${m.node.summary}) is a low-tension trough right after the peak "${m.after.label}". Propose how to use it as Ma — a breath that lets the prior moment land — and what NOT to stage here.`; return (
                <FlagCard key={k} c={PALETTE.ma} title={`“${m.node.label}” wants to be Ma`} onClick={() => setSel({ kind: "node", id: m.id })}>Low tension right after the peak at “{m.after.label}.” Protect it.<Suggest state={sugg[k]} onAsk={(e) => { e.stopPropagation(); askSuggest(k, opp); }} /></FlagCard>); })}
              {flags.deadAir.map((d) => { const k = `dead:${d.id}`, opp = `Beat "${d.node.label}" (${d.node.summary}) is low-tension with no peak before it and no personal thread landing — dead air. Propose stakes to give it, or make the case to cut it.`; return (
                <FlagCard key={k} c={PALETTE.inkMute} title={`“${d.node.label}” reads as dead air`} onClick={() => setSel({ kind: "node", id: d.id })}>No peak before it, no thread here. Empty, not earned.<Suggest state={sugg[k]} onAsk={(e) => { e.stopPropagation(); askSuggest(k, opp); }} /></FlagCard>); })}

              <SectionTitle icon={<Users size={14} color={PALETTE.teal} />}>Coverage</SectionTitle>
              {pcs.length === 0 && <Empty>No personal quests yet.</Empty>}
              {pcs.map(([pc, n]) => { const max = Math.max(1, ...pcs.map((x) => x[1])); return (
                <div key={pc} style={{ marginBottom: 10, cursor: "pointer" }} onClick={() => setFocusPC(focusPC === pc ? null : pc)}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}><span style={{ color: n === 0 ? PALETTE.coral : PALETTE.ink }}>{pc}</span><span style={{ color: PALETTE.inkMute }}>{n} {n === 1 ? "beat" : "beats"}</span></div>
                  <div style={{ height: 5, background: "#ffffff14", borderRadius: 3 }}><div style={{ height: 5, width: `${(n / max) * 100}%`, background: n === 0 ? PALETTE.coral : PALETTE.teal, borderRadius: 3 }} /></div>
                </div>); })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================ small components ============================ */
function OpCard({ op, byId, onApply }) {
  if (op.kind === "write") {
    return (
      <div style={{ marginTop: 8, background: "#ffffff0c", borderRadius: 10, padding: "10px 12px", borderLeft: `2px solid ${PALETTE.teal}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: PALETTE.teal }}>{op.title || "Passage"}{op.target && byId[op.target] ? ` · ${byId[op.target].label}` : ""}</span>
          {op.target && byId[op.target] && (op.applied ? <span style={{ fontSize: 11, color: PALETTE.teal, display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={12} /> attached</span>
            : <button onClick={onApply} style={miniBtn(PALETTE.teal)}>Attach to card</button>)}
        </div>
        <div style={{ fontSize: 13, color: PALETTE.ink, fontFamily: SERIF, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{op.body}</div>
      </div>
    );
  }
  const desc = op.kind === "add_card" ? `Add ${op.card?.type || "card"}: “${op.card?.label || ""}”`
    : op.kind === "edit_card" ? `Edit ${byId[op.id]?.label || op.id}: ${Object.keys(op.changes || {}).join(", ")}`
    : op.kind === "add_pipe" ? `Pipe ${byId[op.from]?.label || op.from} → ${byId[op.to]?.label || op.to} (${op.type})` : op.kind;
  const detail = op.kind === "edit_card" ? Object.entries(op.changes || {}).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ")
    : op.kind === "add_card" ? op.card?.summary : op.kind === "add_pipe" ? op.why : "";
  return (
    <div style={{ marginTop: 8, background: "#ffffff0a", borderRadius: 10, padding: "9px 12px", borderLeft: `2px solid ${PALETTE.gold}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: PALETTE.gold }}>{desc}</span>
        {op.applied ? <span style={{ fontSize: 11, color: PALETTE.teal, display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={12} /> applied</span> : <button onClick={onApply} style={miniBtn(PALETTE.gold)}>Apply</button>}
      </div>
      {detail && <div style={{ fontSize: 12, color: PALETTE.inkMute, marginTop: 4, fontFamily: SERIF, lineHeight: 1.5 }}>{detail}</div>}
    </div>
  );
}

function btn(color, ghost) { return { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, fontSize: 12.5, fontFamily: MONO, cursor: "pointer", border: `1px solid ${ghost ? "rgba(255,255,255,0.14)" : color}`, background: ghost ? "transparent" : color + "22", color: ghost ? PALETTE.inkMute : color }; }
function miniBtn(color) { return { padding: "3px 9px", borderRadius: 6, fontSize: 11, fontFamily: MONO, cursor: "pointer", border: `1px solid ${color}66`, background: color + "1c", color }; }
function fld(w) { return { background: PALETTE.bg, color: PALETTE.ink, border: `1px solid ${PALETTE.panelEdge}`, borderRadius: 7, padding: "6px 8px", fontFamily: MONO, fontSize: 12.5, width: w ? w : undefined, flex: w ? undefined : 1, boxSizing: "border-box", minWidth: 0 }; }
function inp(h) { return { width: "100%", minHeight: h, background: PALETTE.bg, color: PALETTE.ink, border: `1px solid ${PALETTE.panelEdge}`, borderRadius: 9, padding: 10, fontFamily: MONO, fontSize: 13, resize: "vertical", boxSizing: "border-box" }; }
function Field({ label, children }) { return <label style={{ display: "block", fontSize: 11.5, color: PALETTE.inkMute }}>{label}<div style={{ marginTop: 5 }}>{children}</div></label>; }
function Tab({ active, onClick, icon, children }) { return <div onClick={onClick} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 0", fontSize: 12.5, cursor: "pointer", color: active ? PALETTE.gold : PALETTE.inkMute, borderBottom: `2px solid ${active ? PALETTE.gold : "transparent"}`, background: active ? "#ffffff06" : "transparent" }}>{icon}{children}</div>; }
function Suggest({ state, onAsk }) {
  return (
    <div style={{ marginTop: 9 }} onClick={(e) => e.stopPropagation()}>
      <button onClick={onAsk} disabled={state?.loading} style={{ ...miniBtn(PALETTE.gold), display: "inline-flex", alignItems: "center", gap: 5 }}><Sparkles size={12} /> {state?.loading ? "Consulting…" : state?.items ? "Re-suggest" : "Suggest moves"}</button>
      {state?.error && <div style={{ color: PALETTE.coral, fontSize: 11.5, marginTop: 6 }}>{state.error}</div>}
      {state?.items && <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 8 }}>{state.items.map((s, i) => (
        <div key={i} style={{ background: "#ffffff0c", borderRadius: 8, padding: "9px 11px", borderLeft: `2px solid ${PALETTE.gold}` }}>
          <div style={{ fontSize: 12.5, color: PALETTE.gold, marginBottom: 3 }}>{s.title}</div>
          <div style={{ fontSize: 12.5, color: PALETTE.ink, lineHeight: 1.55, fontFamily: SERIF }}>{s.detail}</div>
        </div>))}</div>}
    </div>
  );
}
function Chip({ active, onClick, children }) { return <span onClick={onClick} style={{ padding: "3px 9px", borderRadius: 20, cursor: "pointer", fontSize: 11.5, border: `1px solid ${active ? PALETTE.teal : "rgba(255,255,255,0.12)"}`, background: active ? PALETTE.teal + "22" : "transparent", color: active ? PALETTE.teal : PALETTE.inkMute }}>{children}</span>; }
function Legend({ c, children }) { return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, height: 3, background: c, borderRadius: 2, display: "inline-block" }} />{children}</span>; }
function SectionTitle({ icon, children }) { return <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "16px 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: PALETTE.inkMute }}>{icon}{children}</div>; }
function FlagCard({ c, title, children, onClick }) { return <div onClick={onClick} style={{ borderLeft: `3px solid ${c}`, background: "#ffffff08", borderRadius: "0 8px 8px 0", padding: "10px 12px", marginBottom: 9, cursor: "pointer" }}><div style={{ fontSize: 13, color: c, marginBottom: 4 }}>{title}</div><div style={{ fontSize: 12.5, color: PALETTE.inkMute, lineHeight: 1.55, fontFamily: SERIF }}>{children}</div></div>; }
function Empty({ children }) { return <div style={{ fontSize: 12.5, color: PALETTE.inkFaint, fontStyle: "italic" }}>{children}</div>; }
