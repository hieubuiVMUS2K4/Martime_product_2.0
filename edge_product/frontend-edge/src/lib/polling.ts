/** Schedule the next read after the previous one finishes; stop on denied access. */
export function startPolling(task: () => Promise<void>, intervalMs: number) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  const run = async () => {
    let delay = intervalMs
    try {
      await task()
    } catch (error: any) {
      const status = error?.response?.status
      if (status === 401 || status === 403) return
      delay = status === 429 ? 30_000 : 5_000
    }
    if (!stopped) timer = setTimeout(run, delay)
  }
  timer = setTimeout(run, intervalMs)
  return () => { stopped = true; clearTimeout(timer) }
}
