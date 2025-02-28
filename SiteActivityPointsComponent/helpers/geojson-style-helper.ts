export function setStylesByFeatureType(feature: any) {

    const geometry = feature.getGeometry();
    // console.log('STYLES: geometry: ', geometry);
    const geometryType = geometry?.getType();
    
    switch(geometryType) {
        case 'Point': {
            const icon = feature.getProperty('icon');
            const title = feature.getProperty('name');

            return {
                icon,
                title
            }
        }
        case 'LineString': {
            const stroke = feature.getProperty('stroke') || '#000000';
            const strokeOpacity = feature.getProperty('stroke-opacity') || 1;
            const strokeWidth = feature.getProperty('stroke-width') || 1;

            return {
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