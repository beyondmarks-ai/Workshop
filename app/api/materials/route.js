import { deleteMaterial, getStoredFile, listMaterials, renameMaterial, uploadMaterial } from "../../../lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request) {
  try {
    const query = new URL(request.url).searchParams;
    if (query.has("blob")) {
      const file = await getStoredFile(query.get("container"), query.get("blob"));
      return new Response(file.data, { headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=300" } });
    }
    return Response.json({ materials: await listMaterials() });
  } catch (error) {
    console.error("Material listing failed", error);
    return Response.json({ error: error.message || "Could not load materials." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("material");
    if (!(file instanceof File) || !file.size) {
      return Response.json({ error: "Choose a material to upload." }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return Response.json({ error: "Material size must be 20 MB or less." }, { status: 400 });
    }
    return Response.json({ material: await uploadMaterial(file) }, { status: 201 });
  } catch (error) {
    console.error("Material upload failed", error);
    return Response.json({ error: error.message || "Could not save material." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { id, name } = await request.json();
    const cleanName = String(name || "").trim();
    if (!cleanName || cleanName.length > 160) {
      return Response.json({ error: "Enter a valid name." }, { status: 400 });
    }
    await renameMaterial(String(id || ""), cleanName);
    return Response.json({ renamed: true, name: cleanName });
  } catch (error) {
    console.error("Material rename failed", error);
    return Response.json({ error: error.message || "Could not rename material." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    await deleteMaterial(id);
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("Material delete failed", error);
    return Response.json({ error: error.message || "Could not delete material." }, { status: 500 });
  }
}
