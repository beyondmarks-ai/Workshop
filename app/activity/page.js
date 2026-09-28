"use client";

import { useEffect, useState } from "react";
import GravityStarsBackground from "../components/gravity-stars-background";

export default function ActivityPage() {
  const [activities, setActivities] = useState(null);
  const [database, setDatabase] = useState(null);
  const [expanded, setExpanded] = useState(null);
  useEffect(() => { fetch("/api/activity").then((response) => response.ok ? response.json() : Promise.reject()).then((data) => { setDatabase(data); setActivities(data.activities); }).catch(() => setActivities([])); }, []);
  return <main className="resources-shell"><GravityStarsBackground starsCount={75} className="dashboard-stars" /><header><div><small>COSMOS DB DATA EXPLORER</small><h1>My Activity</h1><p>Only your partitioned records are visible here.</p></div><a href="/dashboard">Dashboard</a></header>{database && <section className="db-meta"><article><small>DATABASE</small><strong>{database.database}</strong></article><article><small>CONTAINER</small><strong>{database.container}</strong></article><article><small>PARTITION</small><strong>{database.partitionKey}</strong></article><article><small>DOCUMENTS</small><strong>{activities?.length || 0}</strong></article></section>}<section className="resource-list">{activities === null ? <p>Loading activityâ€¦</p> : activities.length ? activities.map((activity) => { const added = activity.action === "credit-added" || activity.action === "credit-refunded"; const label = activity.action === "credit-refunded" ? "Automatic refund" : activity.service === "admin-credit" ? (activity.action === "credit-added" ? "Credits added" : "Credits removed") : activity.service; return <article className="db-document" key={activity.id}><div><strong>{label}</strong><span>{new Date(activity.createdAt).toLocaleString()} · {activity.status} · {added ? "+" : "-"}{Math.abs(activity.creditsUsed)} credits{activity.balance !== undefined ? ` · Balance ${activity.balance}` : ""}</span>{activity.note && <p className="activity-note">{activity.note}</p>}</div><button type="button" onClick={() => setExpanded(expanded === activity.id ? null : activity.id)}>{expanded === activity.id ? "Hide document" : "View document"}</button>{expanded === activity.id && <pre>{JSON.stringify(activity, null, 2)}</pre>}</article>; }) : <p>No activity recorded yet. Your first API call will appear here.</p>}</section></main>;
}
