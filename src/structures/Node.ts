import LavasfyClient from "../Client";
import { LavalinkTrackResponse, NodeOptions } from "../typings";
import Resolver from "./Resolver";

export default class Node {
    public resolver = new Resolver(this);

    public name!: string;
    public host!: string;
    public port!: number | string;
    public auth!: string;
    public secure!: boolean;

    private readonly methods = {
        album: this.resolver.getAlbum.bind(this.resolver),
        playlist: this.resolver.getPlaylist.bind(this.resolver),
        track: this.resolver.getTrack.bind(this.resolver)
    };

    public constructor(public client: LavasfyClient, options: NodeOptions) {
        Object.defineProperties(this, {
            name: { value: options.name, enumerable: true },
            host: { value: options.host },
            port: { value: options.port },
            auth: { value: options.auth },
            secure: { value: options.secure }
        });
    }

    /**
     * A method for loading Spotify URLs
     * @returns Lavalink-like /loadtracks response
     */
    public load(url: string): Promise<LavalinkTrackResponse> {
        const [, type, id] = this.client.spotifyPattern.exec(url) ?? [];
        return this.methods[type as keyof Node["methods"]](id);
    }
}
