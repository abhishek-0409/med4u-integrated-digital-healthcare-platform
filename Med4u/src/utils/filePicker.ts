import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { PickedFile } from "../types/prescription";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export class PickerError extends Error {}

const fromImageAsset = (asset: ImagePicker.ImagePickerAsset): PickedFile => ({
  uri: asset.uri,
  name: asset.fileName ?? `prescription-${Date.now()}.jpg`,
  mimeType: asset.mimeType ?? "image/jpeg",
  size: asset.fileSize,
});

function assertSize(file: PickedFile): PickedFile {
  if (file.size !== undefined && file.size > MAX_UPLOAD_BYTES) {
    throw new PickerError("That file is larger than 5 MB. Choose a smaller photo or PDF.");
  }
  return file;
}

/** Each picker resolves to null when the user backs out, and throws PickerError with a readable message otherwise. */
export const filePicker = {
  async takePhoto(): Promise<PickedFile | null> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new PickerError("Camera access is turned off. Allow it in settings, or choose a photo instead.");
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    return result.canceled ? null : assertSize(fromImageAsset(result.assets[0]));
  },

  async choosePhoto(): Promise<PickedFile | null> {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    return result.canceled ? null : assertSize(fromImageAsset(result.assets[0]));
  },

  async choosePdf(): Promise<PickedFile | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return assertSize({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "application/pdf",
      size: asset.size,
    });
  },
};
