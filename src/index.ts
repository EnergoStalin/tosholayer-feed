import { AnimeLayer, Credentials } from 'animelayerjs'
import { toshoURL } from './constants'
import  type { ToshoEntry } from './types'
// @ts-ignore
import parseFileName from 'anime-file-parser'

export interface Env {
	ANIMELAYER_LOGIN: string
	ANIMELAYER_PASSWORD: string
}

let animelayer: AnimeLayer

function mapToTosho(list: any): Partial<ToshoEntry> {
	return {
		id: list.hash,
		title: `[${list.uploader}] ${list.title}`,
		torrent_name: list.title,
		info_hash: list.hash,
		magnet_uri: list.magnetUri,
		seeders: list.seed,
		leechers: list.leech,
		torrent_downloaded_count: list.seed + list.leech,
		timestamp: list.datlist.getTime() / 1000,
		total_size: sizeToBytes(list.size),
		status: 'complete',
	}
}

async function queryAnimelayer(searchTerm: string) {
	return animelayer.searchWithMagnet(searchTerm, { quality: '1920x1080', episode: 1 })
}

function sizeToBytes(size: string) {
	const units: Record<string, number> = {
		"GB": 1e+9,
		"MB": 1e+6
	}
	const [float, unit] = size.split(' ')
	return parseFloat(float) * units[unit]
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			if (!animelayer) {
				animelayer = new AnimeLayer(new Credentials(env.ANIMELAYER_LOGIN, env.ANIMELAYER_PASSWORD))
			}

			const { pathname, search } = new URL(request.url)
			const tosho = await fetch(toshoURL + pathname + search)
			if (pathname !== '/json') {
				return tosho
			}


			const toshoJson = await tosho.json<ToshoEntry[]>()
			const parsed = toshoJson
				.map(e => parseFileName(e.torrent_name))
				.filter(e => e && e.animeTitle)
				.map(e => ({
					...e,
					animeTitle:
						e.animeTitle
						.split(' ').
						filter((a: string) => !/[0-9]/.exec(a)).join(' ')
					}
				))
				.sort((a, b) => (a.animeTitle?.length ?? 0) - (b.animeTitle?.length ?? 0))
				.reverse()

			const searchTerm = parsed[0].animeTitle

			let list = await queryAnimelayer(searchTerm)
			if(list.length === 0) {
				list = await queryAnimelayer(parsed.pop().animeTitle)
			}

			const mapped = list.map((e) => mapToTosho(e)) as Partial<ToshoEntry>[]

			return new Response(JSON.stringify([...toshoJson, ...mapped]), {
				status: 200,
			})
		} catch (e) {
			console.error(e)
			return new Response((e as Error).stack, { status: 500 })
		}
	},
}
