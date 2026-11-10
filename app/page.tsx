import React from "react";
import TopicsList from "./topics-list";
import AuthGate from "./auth-gate";

export default function Home() {
  return (
    <AuthGate>
      <main>
        <TopicsList />
      </main>
    </AuthGate>
  );
}
