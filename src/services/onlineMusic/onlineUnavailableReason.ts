import type { SongResult } from '../../types';
import type { SkipPromptMessageKey } from '../../types/appPlayback';
import type { ProviderSongAvailability } from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import { getSongAvailability, getSongUnavailableLabel } from './songAvailability';

// src/services/onlineMusic/onlineUnavailableReason.ts

export type OnlineAudioUnavailableReason =
    | 'taken-down'
    | 'membership'
    | 'no-play-link'
    | 'temporary';

export const isQqPayRestricted = (song: SongResult | null | undefined): boolean => {
    if (!song?.sourceRef || song.sourceRef.kind !== 'online' || song.sourceRef.providerId !== 'qq') {
        return false;
    }
    const data = song.sourceRef.providerData ?? {};
    return Number(data.payPlay) === 1 || Number(data.payMonth) === 1;
};

export const resolveOnlineAudioUnavailableReason = (
    song: SongResult,
    error?: unknown,
): OnlineAudioUnavailableReason => {
    if (getSongAvailability(song).state === 'unavailable') return 'taken-down';
    if (error instanceof OnlineProviderError) {
        if (error.code === 'not-playable') {
            return isQqPayRestricted(song) ? 'membership' : 'no-play-link';
        }
        return 'temporary';
    }
    if (isQqPayRestricted(song)) return 'membership';
    return 'no-play-link';
};

export const onlineUnavailableStatusKey = (
    reason: OnlineAudioUnavailableReason,
): 'status.songUnavailable'
    | 'status.songNoPlayLinkMembership'
    | 'status.songNoPlayLink'
    | 'status.playbackError' => {
    switch (reason) {
        case 'taken-down':
            return 'status.songUnavailable';
        case 'membership':
            return 'status.songNoPlayLinkMembership';
        case 'no-play-link':
            return 'status.songNoPlayLink';
        case 'temporary':
            return 'status.playbackError';
    }
};

export const onlineUnavailablePromptKey = (
    reason: OnlineAudioUnavailableReason,
): SkipPromptMessageKey => {
    switch (reason) {
        case 'taken-down':
            return 'status.songUnavailablePrompt';
        case 'membership':
            return 'status.songNoPlayLinkMembershipPrompt';
        case 'no-play-link':
            return 'status.songNoPlayLinkPrompt';
        case 'temporary':
            return 'status.playbackErrorPrompt';
    }
};

/** Soft list badge: true takedown or QQ pay-gated hint. Does not block playback. */
export const getSongListBadgeLabel = (
    song: SongResult | null | undefined,
    labels: { unavailable: string; membership: string },
): string | null => {
    if (!song) return null;
    const availability: ProviderSongAvailability = getSongAvailability(song);
    if (availability.state === 'unavailable') {
        return getSongUnavailableLabel(song, labels.unavailable);
    }
    if (isQqPayRestricted(song)) return labels.membership;
    return null;
};
