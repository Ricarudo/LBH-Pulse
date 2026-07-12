"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { canUser } from "@pulse/contracts/auth";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { ClientRecord } from "@pulse/contracts/clients";
import type {
  RequestAssignee,
  RequestRecord,
  RequestStatus
} from "@pulse/contracts/requests";
import { RequestIntakeWizard } from "./RequestIntakeWizard";
import { RequestsQueueWorkspace } from "./RequestsQueueWorkspace";

type RequestListResponse = {
  requests: RequestRecord[];
  assignees: RequestAssignee[];
};

type RequestResponse = {
  request: RequestRecord;
};

type ClientListResponse = {
  clients: ClientRecord[];
};

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Request failed."
    );
  }

  return data as T;
}

export function RequestsQueueModule({
  openNewOnLoad = false
}: {
  openNewOnLoad?: boolean;
}) {
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [assignees, setAssignees] = useState<RequestAssignee[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [handledOpenNewOnLoad, setHandledOpenNewOnLoad] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const canWriteCrm = canUser(user, "requests:write");

  useEffect(() => {
    async function loadQueue() {
      try {
        setIsLoading(true);
        setLoadError("");
        const [requestData, clientData] = await Promise.all([
          requestJson<RequestListResponse>("/api/requests", {
            cache: "no-store"
          }),
          requestJson<ClientListResponse>("/api/clients", {
            cache: "no-store"
          })
        ]);
        setRequests(requestData.requests);
        setAssignees(requestData.assignees);
        setClients(clientData.clients);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load requests from the API."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadQueue();
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!openNewOnLoad || handledOpenNewOnLoad || isUserLoading) {
      return;
    }

    setHandledOpenNewOnLoad(true);
    router.replace("/requests", { scroll: false });

    if (!canWriteCrm) {
      setToast("Your role does not allow creating requests.");
      return;
    }

    setIntakeOpen(true);
  }, [
    canWriteCrm,
    handledOpenNewOnLoad,
    isUserLoading,
    openNewOnLoad,
    router
  ]);

  function replaceRequest(updatedRequest: RequestRecord) {
    setRequests((current) =>
      current.map((request) =>
        request.id === updatedRequest.id ? updatedRequest : request
      )
    );
  }

  function openCreateForm() {
    if (!canWriteCrm) {
      setToast("Your role does not allow creating requests.");
      return;
    }

    setIntakeOpen(true);
  }

  function handleIntakeClientChanged(client: ClientRecord) {
    setClients((current) =>
      current.some((item) => item.id === client.id)
        ? current.map((item) => (item.id === client.id ? client : item))
        : [client, ...current]
    );
  }

  function handleIntakeCreated(request: RequestRecord) {
    setRequests((current) => [request, ...current]);
    router.replace("/requests?view=open", { scroll: false });
    setToast(`${request.requestNumber} created.`);
  }

  async function updateOwner(
    request: RequestRecord,
    assignedToId: string
  ) {
    if (!canWriteCrm) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ assignedToId })
        }
      );
      replaceRequest(data.request);
      setToast(
        assignedToId
          ? `${data.request.requestNumber} assigned to ${data.request.assignedToName}.`
          : `${data.request.requestNumber} is now unassigned.`
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Unable to update request assignment."
      );
    }
  }

  async function updateStatus(
    request: RequestRecord,
    status: RequestStatus,
    reason = ""
  ) {
    if (!canWriteCrm) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status, reason })
        }
      );
      replaceRequest(data.request);
      setToast(`${data.request.requestNumber} moved to ${data.request.status}.`);
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Unable to update status."
      );
    }
  }

  return (
    <div className="leads-module">
      <RequestsQueueWorkspace
        requests={requests}
        assignees={assignees}
        currentUser={user ? { id: user.id, name: user.name } : null}
        isLoading={isLoading}
        loadError={loadError}
        canWrite={canWriteCrm}
        onCreateRequest={openCreateForm}
        onOwnerChange={updateOwner}
        onStatusChange={updateStatus}
      />

      {toast ? (
        <div className="lead-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      <RequestIntakeWizard
        isOpen={intakeOpen}
        clients={clients}
        assignees={assignees}
        currentUser={user}
        onClose={() => setIntakeOpen(false)}
        onClientChanged={handleIntakeClientChanged}
        onCreated={handleIntakeCreated}
      />
    </div>
  );
}
