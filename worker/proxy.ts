const vercelOrigin = "https://boosterpacks-tscircuit-com.vercel.app"

export default {
  async fetch(request: Request): Promise<Response> {
    const incomingUrl = new URL(request.url)
    const upstreamUrl = new URL(
      `${incomingUrl.pathname}${incomingUrl.search}`,
      vercelOrigin,
    )
    const upstreamResponse = await fetch(new Request(upstreamUrl, request), {
      redirect: "manual",
    })

    const response = new Response(upstreamResponse.body, upstreamResponse)
    const location = response.headers.get("location")

    if (location?.startsWith(vercelOrigin)) {
      response.headers.set(
        "location",
        location.replace(vercelOrigin, incomingUrl.origin),
      )
    }

    return response
  },
}
