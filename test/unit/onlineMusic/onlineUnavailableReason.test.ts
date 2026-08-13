import { describe, expect, it } from 'vitest';
import {
    getSongListBadgeLabel,
    isQqPayRestricted,
    onlineUnavailablePromptKey,
    onlineUnavailableStatusKey,
    resolveOnlineAudioUnavailableReason,
} from '@/services/onlineMusic/onlineUnavailableReason';
import { OnlineProviderError } from '@/types/onlineMusic';
import type { SongResult } from '@/types';

// test/unit/onlineMusic/onlineUnavailableReason.test.ts

const qqSong = (payPlay?: number): SongResult => ({
    id: 'qq-song',
    name: '泪桥 (Live)',
    artists: [],
    album: { id: 'album', name: 'Album' },
    durationMs: 1000,
    sourceRef: {
        kind: 'online',
        providerId: 'qq',
        mediaId: '001nTF6c43T9ln',
        providerData: payPlay === undefined ? { songMid: '001nTF6c43T9ln' } : {
            songMid: '001nTF6c43T9ln',
            payPlay,
        },
    },
});

const neteaseUnavailable: SongResult = {
    id: 1,
    name: 'Taken down',
    artists: [],
    album: { id: 1, name: 'Album' },
    durationMs: 1000,
    privilege: { st: -200 },
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: '1' },
};

describe('online unavailable reason mapping', () => {
    it('marks QQ pay_play songs as membership-restricted without treating them as taken down', () => {
        const song = qqSong(1);
        expect(isQqPayRestricted(song)).toBe(true);
        expect(resolveOnlineAudioUnavailableReason(
            song,
            new OnlineProviderError('not-playable', '暂无播放链接', 'qq'),
        )).toBe('membership');
        expect(onlineUnavailablePromptKey('membership')).toBe('status.songNoPlayLinkMembershipPrompt');
        expect(onlineUnavailableStatusKey('membership')).toBe('status.songNoPlayLinkMembership');
        expect(getSongListBadgeLabel(song, {
            unavailable: '已下架',
            membership: '需会员',
        })).toBe('需会员');
    });

    it('uses no-play-link copy when QQ refuses a stream without pay flags', () => {
        const song = qqSong();
        expect(resolveOnlineAudioUnavailableReason(
            song,
            new OnlineProviderError('not-playable', '暂无播放链接', 'qq'),
        )).toBe('no-play-link');
        expect(getSongListBadgeLabel(song, {
            unavailable: '已下架',
            membership: '需会员',
        })).toBeNull();
    });

    it('keeps taken-down copy for NetEase privilege blocks', () => {
        expect(resolveOnlineAudioUnavailableReason(neteaseUnavailable)).toBe('taken-down');
        expect(onlineUnavailablePromptKey('taken-down')).toBe('status.songUnavailablePrompt');
    });

    it('maps transient provider failures separately from empty play links', () => {
        expect(resolveOnlineAudioUnavailableReason(
            qqSong(),
            new OnlineProviderError('unavailable', 'boom', 'qq'),
        )).toBe('temporary');
        expect(onlineUnavailablePromptKey('temporary')).toBe('status.playbackErrorPrompt');
    });
});
