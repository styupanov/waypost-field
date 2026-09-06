"use client";

import { useEffect, useState } from "react";
import { INTEREST_CATEGORIES } from "@/lib/interests/taxonomy";
import type { InterestCategory } from "@/types/preferences";
import type { UserInterestProfileResponse } from "@/types/user-interests";
import styles from "./UserInterestsDialog.module.css";

export default function UserInterestsDialog({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<InterestCategory[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "load_error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/me/interests", { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("load"); return response.json() as Promise<UserInterestProfileResponse>; })
      .then((profile) => { setSelected(profile.selectedCategories); setStatus("ready"); })
      .catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) { setError("Your interests could not be loaded. Close and try again."); setStatus("load_error"); } });
    return () => controller.abort();
  }, []);

  function toggle(category: InterestCategory, checked: boolean) {
    setSelected((current) => checked ? [...current, category] : current.filter((item) => item !== category));
    setError(null);
  }

  async function save() {
    if (status !== "ready") return;
    setStatus("saving"); setError(null);
    try {
      const response = await fetch("/api/me/interests", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedCategories: selected }) });
      if (!response.ok) throw new Error("save");
      onClose();
    } catch {
      setError("Your interests could not be saved. Try again."); setStatus("ready");
    }
  }

  return <div className={styles.backdrop} role="presentation">
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="user-interests-heading">
      <h2 id="user-interests-heading">Your interests</h2>
      <p>What do you usually enjoy on road trips?</p>
      {status === "loading" ? <p role="status">Loading interests…</p> : status !== "load_error" ? <fieldset className={styles.choices} disabled={status === "saving"}>
        {INTEREST_CATEGORIES.map(({ key, label }) => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={(event) => toggle(key, event.target.checked)} />{label}</label>)}
      </fieldset> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button type="button" disabled={status === "saving"} onClick={onClose}>Cancel</button>
        <button type="button" disabled={status !== "ready"} onClick={() => void save()}>{status === "saving" ? "Saving…" : "Save"}</button>
      </div>
    </section>
  </div>;
}
