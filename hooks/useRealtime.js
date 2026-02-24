import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Subscribe to Supabase Realtime postgres_changes for the given tables.
 * When any INSERT/UPDATE/DELETE happens on those tables, refetch() is called
 * so the UI updates without manual refresh.
 *
 * @param {string[]} tableNames - e.g. ['goals', 'goal_lists', 'group_goal_participants']
 * @param {() => void | Promise<void>} refetch - called when any change is received
 * @param {string} [channelName] - optional channel id (default: realtime-{tables joined})
 */
export function useRealtime(tableNames, refetch, channelName) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!tableNames?.length) return;

    const channel = supabase.channel(
      channelName || `realtime-${tableNames.join('-')}-${Date.now()}`
    );

    tableNames.forEach((table) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        () => {
          refetchRef.current?.();
        }
      );
    });

    let errorWarned = false;
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' && !errorWarned) {
        errorWarned = true;
        if (__DEV__) {
          console.warn(
            '[useRealtime] Realtime subscription failed for tables:',
            tableNames,
            '— Enable Realtime in Supabase: Database → Replication → add these tables.'
          );
        }
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableNames?.join(',')]); // re-subscribe if table list changes
}
