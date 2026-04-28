const getCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  const folder = process.env.CLOUDINARY_FOLDER;

  if (!cloudName || !uploadPreset) {
    throw new Error('Missing Cloudinary configuration. Add CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET.');
  }

  return { cloudName, uploadPreset, folder };
};

export const uploadOriginalImageToCloudinary = async (file: File) => {
  const { cloudName, uploadPreset, folder } = getCloudinaryConfig();
  const formData = new FormData();

  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  if (folder) {
    formData.append('folder', folder);
  }

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Cloudinary upload failed.');
  }

  return response.json();
};
