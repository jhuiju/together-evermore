import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function UpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;
    let registration: ServiceWorkerRegistration | null = null;

    const promote = (worker: ServiceWorker | null) => {
      if (!worker) return;
      setWaitingWorker(worker);
      setVisible(true);
    };

    const trackInstalling = (worker: ServiceWorker) => {
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          promote(worker);
        }
      });
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) promote(reg.waiting);
      if (reg.installing) trackInstalling(reg.installing);
      reg.addEventListener("updatefound", () => {
        if (reg.installing) trackInstalling(reg.installing);
      });

      intervalId = setInterval(() => {
        reg.update().catch(() => {});
      }, 60000);
    });

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      void registration;
    };
  }, []);

  if (!visible || !waitingWorker) return null;

  const handleUpdate = () => {
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    waitingWorker.postMessage("SKIP_WAITING");
  };

  const handleDismiss = () => setVisible(false);

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-card/95 backdrop-blur border-b border-border shadow-md">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
        <p className="text-sm text-foreground flex-1 min-w-0">
          새로운 버전이 있어요! 업데이트하면 최신 기능을 사용할 수 있어요.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            나중에
          </Button>
          <Button size="sm" onClick={handleUpdate}>
            지금 업데이트
          </Button>
        </div>
      </div>
    </div>
  );
}