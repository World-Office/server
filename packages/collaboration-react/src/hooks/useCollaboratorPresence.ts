import type { CollabUser } from "@world-office/editor-stores"
import { useMemo } from "react"

export interface PresenceInfo {
  users: CollabUser[]
  userCount: number
  currentUser: CollabUser | null
  otherUsers: CollabUser[]
  isConnected: boolean
}

/**
 * Derives presence information from CollaborationStore users.
 * Pure computation — no side effects.
 */
export function useCollaboratorPresence(users: CollabUser[], isConnected: boolean): PresenceInfo {
  return useMemo(() => {
    const currentUser = users.find((u) => u.isCurrentUser) ?? null
    const otherUsers = users.filter((u) => !u.isCurrentUser)

    return {
      users,
      userCount: users.length,
      currentUser,
      otherUsers,
      isConnected,
    }
  }, [users, isConnected])
}
