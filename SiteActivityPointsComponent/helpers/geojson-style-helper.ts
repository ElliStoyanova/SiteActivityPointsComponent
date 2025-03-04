import { defaultIconUrl } from '../configuration/configuration'

export function setStylesByFeatureType(feature: any) {

    const geometry = feature.getGeometry();
    const geometryType = geometry?.getType();
    
    switch(geometryType) {
        case 'Point':
        case 'MultiPoint': {
            const iconUrl = feature.getProperty('icon');
            const title = feature.getProperty('name');

            // const isValidIconUrl = await isIconUrlValid(iconUrl);

            return {
                icon: iconUrl,
                title
            }
        }
        case 'LineString':
        case 'MultiLineString': {
            const stroke = feature.getProperty('stroke') || '#000000';
            const strokeOpacity = feature.getProperty('stroke-opacity') || 1;
            const strokeWidth = feature.getProperty('stroke-width') || 1;

            return {
                strokeColor: stroke,
                strokeOpacity: strokeOpacity,
                strokeWeight: strokeWidth
            };
        }
        
        case 'Polygon':
        case 'MultiPolygon': {
            const stroke = feature.getProperty('stroke') || '#000000';
            const strokeOpacity = feature.getProperty('stroke-opacity') || 1;
            const strokeWidth = feature.getProperty('stroke-width') || 1;
            const fillOpacity = feature.getProperty('fill-opacity') || 0.5;
            const fillColor = feature.getProperty('fill') || '#000000';

            return {
                fillOpacity,
                fillColor,
                strokeColor: stroke,
                strokeOpacity: strokeOpacity,
                strokeWeight: strokeWidth
            };
        }

        default: {
            return {}
        }
    }
}

function isIconUrlValid(url: string) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true); // URL is valid
      img.onerror = () => resolve(false); // URL is invalid
      img.src = url;
    });
}