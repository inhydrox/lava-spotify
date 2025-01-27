import Node from "./Node";
import request from "node-superfetch";
import { LavalinkTrack, LavalinkTrackResponse, SpotifyAlbum, SpotifyPlaylist, SpotifyTrack } from "../typings";
import Util from "../Util";

export default class Resolver {
    public client = this.node.client;
    public cache = new Map<string, LavalinkTrack>();

    public constructor(public node: Node) {}

    public get token(): string {
        return this.client.token!;
    }

    public get playlistLoadLimit(): number {
        return this.client.options.playlistLoadLimit === 0
            ? Infinity
            : this.client.options.playlistLoadLimit!;
    }

    public async getAlbum(id: string): Promise<LavalinkTrackResponse> {
        const album = await Util.tryPromise(async () => {
            return (await request
                .get(`${this.client.baseURL}/albums/${id}`)
                .set("Authorization", this.token)).body as SpotifyAlbum;
        });

        return {
            loadType: album ? "PLAYLIST_LOADED" : "NO_MATCHES",
            playlistInfo: {
                name: album?.name
            },
            tracks: album
                ? (await Promise.all(album.tracks.items.map(x => this.resolve(x)))).filter(Boolean) as LavalinkTrack[]
                : []
        };
    }

    public async getPlaylist(id: string): Promise<LavalinkTrackResponse> {
        const playlist = await Util.tryPromise(async () => {
            return (await request
                .get(`${this.client.baseURL}/playlists/${id}`)
                .set("Authorization", this.token)).body as SpotifyPlaylist;
        });

        const playlistTracks = playlist ? await this.getPlaylistTracks(playlist) : [];

        return {
            loadType: playlist ? "PLAYLIST_LOADED" : "NO_MATCHES",
            playlistInfo: {
                name: playlist?.name
            },
            tracks: (await Promise.all(playlistTracks.map(x => x.track && this.resolve(x.track)))).filter(Boolean) as LavalinkTrack[]
        };
    }

    public async getTrack(id: string): Promise<LavalinkTrackResponse> {
        const track = await Util.tryPromise(async () => {
            return (await request
                .get(`${this.client.baseURL}/tracks/${id}`)
                .set("Authorization", this.token)).body as SpotifyTrack;
        });

        const lavaTrack = track && await this.resolve(track);

        return {
            loadType: lavaTrack ? "TRACK_LOADED" : "NO_MATCHES",
            playlistInfo: {},
            tracks: lavaTrack ? [lavaTrack] : []
        };
    }

    private async getPlaylistTracks(playlist: {
        tracks: {
            items: Array<{ track: SpotifyTrack }>;
            next: string | null;
        };
    }, currPage = 1): Promise<Array<{ track: SpotifyTrack }>> {
        if (!playlist.tracks.next || currPage >= this.playlistLoadLimit) return playlist.tracks.items;
        currPage++;

        const { body }: any = await request
            .get(playlist.tracks.next)
            .set("Authorization", this.token);

        const { items, next }: { items: Array<{ track: SpotifyTrack }>; next: string | null } = body;

        const mergedPlaylistTracks = playlist.tracks.items.concat(items);

        if (next && currPage < this.playlistLoadLimit) return this.getPlaylistTracks({
            tracks: {
                items: mergedPlaylistTracks,
                next
            }
        }, currPage);
        else return mergedPlaylistTracks;
    }

    private async resolve(track: SpotifyTrack): Promise<LavalinkTrack | undefined> {
        const cached = this.cache.get(track.id);
        if (cached) return Util.structuredClone(cached);

        try {
            const lavaTrack = await this.retrieveTrack(track);
            if (lavaTrack) {
                if (this.client.options.useSpotifyMetadata) {
                    Object.assign(lavaTrack.info, {
                        title: track.name,
                        author: track.artists.map(x => x.name).join(", "),
                        uri: track.external_urls.spotify
                    });
                }
                this.cache.set(track.id, Object.freeze(lavaTrack));
            }
            return Util.structuredClone(lavaTrack);
        } catch {
            return undefined;
        }
    }

    private async retrieveTrack(track: SpotifyTrack): Promise<LavalinkTrack | undefined> {
        try {
            const params = new URLSearchParams({
                identifier: `ytsearch:${track.artists.map(x => x.name).join(", ")} - ${track.name} ${this.client.options.audioOnlyResults ? "Audio" : ""}`
            });
            // @ts-expect-error 2322
            const { body: response }: { body: LavalinkTrackResponse } = await request
                .get(`http${this.node.secure ? "s" : ""}://${this.node.host}:${this.node.port}/loadtracks?${params.toString()}`)
                .set("Authorization", this.node.auth);
            return response.tracks[0];
        } catch {
            return undefined;
        }
    }
}
