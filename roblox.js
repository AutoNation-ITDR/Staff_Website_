// Vercel Serverless Function — proxy per Roblox API (risolve CORS)
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { username } = req.query;
  if (!username) return res.status(400).json({ error: "username required" });

  const FALLBACK = "https://tr.rbxcdn.com/180DAY-6f5f2d2f73728d0f0d3a56d98d0d2178/150/150/AvatarHeadshot/Png";

  try {
    // 1. Risolvi userId da username
    const usersRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    });

    if (!usersRes.ok) return res.status(200).json({ userId: null, avatarUrl: FALLBACK });

    const usersData = await usersRes.json();
    const user = usersData?.data?.[0];
    if (!user) return res.status(200).json({ userId: null, avatarUrl: FALLBACK });

    // 2. Carica avatar headshot
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`
    );
    const thumbData = await thumbRes.json();
    const avatarUrl = thumbData?.data?.[0]?.imageUrl || FALLBACK;

    return res.status(200).json({ userId: user.id, username: user.name, avatarUrl });
  } catch (e) {
    return res.status(200).json({ userId: null, avatarUrl: FALLBACK });
  }
}
