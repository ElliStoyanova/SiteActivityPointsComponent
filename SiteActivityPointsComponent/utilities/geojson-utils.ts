// geojson-utils.ts

export interface GeoJsonPoint {
    type: "Point";
    coordinates: [number, number];
}

export interface GeoJsonFeature {
    type: "Feature";
    geometry: GeoJsonPoint;
    properties: any;
}

export interface GeoJsonFeatureCollection {
    type: "FeatureCollection";
    features: GeoJsonFeature[];
}

export interface GeoJsonProperties {
    name: string,
    description: string
}

export function createGeoJsonPoint(longitude: number, latitude: number): GeoJsonPoint {
    return {
        type: "Point",
        coordinates: [longitude, latitude],
    };
}

export function createGeoJsonFeature(
    longitude: number,
    latitude: number,
    properties?: GeoJsonProperties
): GeoJsonFeature {
    return {
        type: "Feature",
        geometry: createGeoJsonPoint(longitude, latitude),
        properties: properties,
    };
}

export function createGeoJsonFeatureCollection(
    features: GeoJsonFeature[]
): GeoJsonFeatureCollection {
    return {
        type: "FeatureCollection",
        features: features,
    };
}

export function generateGeoJson(coordinates: { latitude: number; longitude: number; properties?: GeoJsonProperties }[]): GeoJsonFeatureCollection {
    const features: GeoJsonFeature[] = coordinates.map((coord) =>
        createGeoJsonFeature(coord.longitude, coord.latitude, coord.properties)
    );
    return createGeoJsonFeatureCollection(features);
    
    // const geoJson = createGeoJsonFeatureCollection(features);
    
    // return JSON.stringify(geoJson);
}