import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import * as ImagePicker from "expo-image-picker";

export type PickedPhoto = { uri: string; mimeType?: string };

/** Photos from the camera or the library; empty if the person cancels or refuses access. */
export async function pickPhotos(source: "camera" | "library"): Promise<PickedPhoto[]> {
  if (source === "camera") {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) throw new Error("Allow camera access in Settings to take Product photos.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    return result.canceled ? [] : result.assets;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsMultipleSelection: true,
  });
  return result.canceled ? [] : result.assets;
}

/** Posts one photo to a Convex upload URL and returns its storage id. */
export async function uploadPhoto(uploadUrl: string, photo: PickedPhoto) {
  const body = await (await fetch(photo.uri)).blob();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": photo.mimeType ?? body.type ?? "image/jpeg" },
    body,
  });
  if (!response.ok) throw new Error("The photo didn't upload. Try again.");
  const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
  return storageId;
}
