const BASE_URL = 'http://localhost:3001/api';

export const apiFetch = (endpoint, options = {}) => {
    return fetch(`${BASE_URL}${endpoint}`, options);
};

export const getJson = (endpoint) => apiFetch(endpoint);

export const postJson = (endpoint, body) => apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});

export const putJson = (endpoint, body) => apiFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});

export const deleteJson = (endpoint) => apiFetch(endpoint, {
    method: 'DELETE'
});

export const downloadBlob = async (endpoint) => {
    const res = await apiFetch(endpoint);
    if (!res.ok) throw new Error('Download failed');
    return await res.blob();
};

export const getErrorMessage = async (response) => {
    try {
        const data = await response.json();
        return data.error || 'Server error';
    } catch {
        return 'Server error';
    }
};
