import { IInputs, IOutputs } from './generated/ManifestTypes';
import * as geoJSONBuildHelper from './helpers/geojson-build-helper';
import * as geoJSONStyleHelper from './helpers/geojson-style-helper';
import { getCenterAndZoomGeoJsonBounds } from './helpers/geojson-center-and-zoom-helper';
import * as config from './configuration/configuration';
import toGeoJSON from '@mapbox/togeojson';
import * as geoXML3 from 'geoxml3';
import { FeatureCollection, GeoJsonProperties, Geometry, Point } from 'geojson';
import { kml } from "@tmcw/togeojson";
import { MarkerWithLabel } from '@googlemaps/markerwithlabel';


export class SiteActivityPointsComponent implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container: HTMLDivElement;
    private context: ComponentFramework.Context<IInputs>;
    private notifyOutputChanged: () => void;

    private map: google.maps.Map | null = null;
    private AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement | null = null;
    private infoWindow = new google.maps.InfoWindow({
        content: ''
    });
    private kmlUrl: string | null = null;
    private initialGeoJSON: FeatureCollection<Geometry | null, GeoJsonProperties> | null;
    private geoJSON: FeatureCollection | null;
    private initialLocationTableName: string;
    private initialFileColumnName: string;
    private initPromise: Promise<void> | null = null;
    private markers: google.maps.marker.AdvancedMarkerElement[] = [];
    private eventListeners: google.maps.MapsEventListener[] = [];

    constructor() {}

    public async init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): Promise<void> {
        this.container = container;
        this.context = context;

        console.log('CONTEXT in init: ', this.context);

        this.container.style.width = "100%";
        this.container.style.height = "800px";   
        this.initializeParameters();     
        console.log('Params initialLocationTableName: ', this.initialLocationTableName);
        // console.log('Params initialFileUrlColumnName: ', this.initialFileUrlColumnName);

        this.initPromise = new Promise<void>((resolve, reject) => {

            this.loadGoogleMaps(this.context.parameters.googleApiKey.raw as string)
                .then(() => {
                    console.log('Google Maps API loaded successfully.');
                    return google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>;
                })
                .then(({ AdvancedMarkerElement }) => {
                    this.AdvancedMarkerElement = AdvancedMarkerElement;
                    this.initializeMap();
                    this.attachClickEventListener();
                    return this.getInitialGeoJSON();
                })
                .then((initialGeoJSON) => {
                    this.initialGeoJSON = initialGeoJSON;
                    console.log('INITIAL GEOJSON IN INIT(): ', JSON.stringify(this.initialGeoJSON));
                    this.addGeoJSONOnMap(this.initialGeoJSON);
                    this.applyCenterAndZoomBoundsOnMap(this.initialGeoJSON);
                    this.applyInitialGeoJSONStyles();
                    console.log('EVERYTHING IN INIT COMPLETED!');
                    resolve();
                    return;
                })
                .catch((error) => {
                    console.error('Initialization error:', error);
                    reject(error);
                    return;
                });
            // try {
            //     await this.loadGoogleMaps(this.context.parameters.googleApiKey.raw as string);
            //     console.log('Google Maps API loaded successfully.');

            //     const { AdvancedMarkerElement } = await google.maps.importLibrary('marker') as google.maps.MarkerLibrary;
            //     this.AdvancedMarkerElement = AdvancedMarkerElement;
        
            //     this.initializeMap();
        
            //     this.attachClickEventListener();
        
            //     this.initialGeoJSON = await this.getInitialGeoJSON();
        
            //     console.log('INITIAL GEOJSON IN INIT(): ', JSON.stringify(this.initialGeoJSON));
        
            //     this.addGeoJSONOnMap(this.initialGeoJSON);
        
            //     this.applyCenterAndZoomBoundsOnMap(this.initialGeoJSON);
        
            //     this.applyInitialGeoJSONStyles();  

            //     console.log('EVERYTHING IN INIT COMPLETED!');
            //     resolve();
            // } catch (error) {
            //     console.error('Initialization error:', error);
            //     reject(error);
            // }            
        });

        return this.initPromise;                    
    }

    private initializeParameters(): void {
        this.initialLocationTableName = this.context.parameters.initialLocationTableName.raw as string || config.initialLocationTableName;
        this.initialFileColumnName = this.context.parameters.initialFileColumnName.raw as string || config.initialFileColumnName;
        // this.initialFileUrlColumnName = this.context.parameters.initialFileUrlColumnName.raw as string || config.initialFileUrlColumnName;
    }

    private applyInitialGeoJSONStyles(): void {

        if(!this.map) {
            return;
        }

        this.map?.data.setStyle(geoJSONStyleHelper.setStylesByFeatureType);  
    }

    private async getInitialGeoJSON(): Promise<FeatureCollection<Geometry | null, GeoJsonProperties> | null> {
        const initialLocationEntityId = this.getInitialLocationEntityId();
        const initialLocationData = await this.getInitialLocationData(initialLocationEntityId);
        
        console.log ('initial location data: ', initialLocationData);
        return initialLocationData?.initialGeoJSON || null;        
    }
 
    private getGeoJsonFromDataset(dataset: ComponentFramework.PropertyTypes.DataSet): FeatureCollection<Geometry, GeoJsonProperties> | null {
        if (dataset?.sortedRecordIds && dataset?.sortedRecordIds.length) {
            
            const coordinates = dataset.sortedRecordIds.reduce(
                (arr: { latitude: number; longitude: number; properties: GeoJsonProperties }[], recordId) => {
                const record = dataset.records[recordId];
                arr.push({
                    latitude: (record.getValue('latitude') as number),
                    longitude: (record.getValue('longitude') as number),
                    properties: {
                        name: record.getValue('name') as string,
                        description: record.getValue('description') as string,
                        category: (record.getValue('category') as any)?.name || null,
                        dateAndTime: record.getValue('dateAndTime') || null
                    }
                });
                return arr;
            },[]);

            return coordinates.length ? geoJSONBuildHelper.generateGeoJson(coordinates) : null;
        }

        return null;
    }

    private getInitialLocationEntityId(): string | null {
        const entityTypeName = (this.context as any).page?.entityTypeName;
        console.log('Entity type name: ', entityTypeName);
        return entityTypeName === this.initialLocationTableName ? (this.context as any).page?.entityId : null;
    }

    private async getInitialLocationData(initialLocationEntityId: string | null): 
        Promise<{ kmlUrl: string | null, initialGeoJSON: FeatureCollection<Geometry | null, GeoJsonProperties> | null } | null> {
        if (!initialLocationEntityId) {
            return null;
        }

        try {
            return await this.getInitialLocationDataFromLinkedEntityFile(initialLocationEntityId);            
        } catch (error) {
            console.log('Error getting Url: ', error); 
            return null;
        }
    }

    private async getInitialLocationDataFromLinkedEntityFile(entityId: string): 
        Promise<{ kmlUrl: string | null, initialGeoJSON: FeatureCollection<Geometry | null, GeoJsonProperties> | null } | null> {
        
        const orgUrl = (this.context as any).page.getClientUrl();
        console.log('ORG URL: ', orgUrl);
        
        try {
            const results = await this.context.webAPI.retrieveRecord(
                this.initialLocationTableName,
                entityId,
                `?$select=${this.initialFileColumnName}`
            );

            console.log('Results from API call: ', results);

            
            const downloadUrl = `${orgUrl}/${config.apiDataVersionUrlFragment}/${this.initialLocationTableName}s(${entityId})/${this.initialFileColumnName}/$value`;

            console.log('Download Url: ', downloadUrl);

            // const { kmlUrl, initialGeoJSON }  = await this.getKmlFromFile(downloadUrl);
            // console.log('KML Url from blob: ', kmlUrl);
            // const kmlUrl = await this.getKmlFromFile(results[this.initialFileColumnName]);

            const fileName = results[`${this.initialFileColumnName}_name`];
            const initialGeoJSON = results[this.initialFileColumnName] ? await this.getInitialGeoJSONFromKml(downloadUrl, fileName): null;            

            if (results) {
                return {
                    kmlUrl: null,
                    initialGeoJSON
                }
            } else {
                return null;
            }
        } catch (error) {
            console.error('Error retrieving initial location data:', error);
            return null;
        }
    }

    // private async getInitialLocationDataFromLinkedEntityUrl(entityId: string): Promise<{ kmlUrl: string } | null> {
    //     try {
    //         const results = await this.context.webAPI.retrieveRecord(
    //             this.initialLocationTableName,
    //             entityId,
    //             `?$select=${this.initialFileUrlColumnName}`
    //         );

    //         console.log('Results from API call: ', results);

    //         if (results) {
    //             return {
    //                 kmlUrl: results[this.initialFileUrlColumnName]
    //             }
    //         } else {
    //             return null;
    //         }
    //     } catch (error) {
    //         console.error("Error retrieving initial location data:", error);
    //         return null;
    //     }
    // }

    private loadGoogleMaps(googleApiKey: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if ((window as any).google && (window as any).google.maps) {
                resolve(); // Google Maps is already loaded
                return;
            }

            const script = document.createElement("script");
            script.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}&v=beta`;
            script.async = true;
            script.defer = true;

            script.onload = () => {
                if ((window as any).google && (window as any).google.maps) {
                    resolve();
                } else {
                    reject(new Error("Google Maps API failed to load correctly."));
                }
            };
    
            script.onerror = () => reject(new Error("Failed to load Google Maps API script."));

            document.head.appendChild(script);
        });
    }


    private getGoogleDriveFileId(url: string | null) {

        if (!url) {
            return null;
        }

        const regex = /\/d\/([^/]+)/; // Regular expression to match /d/ and capture the ID
        const match = url.match(regex);

        if (match && match[1]) {
          return match[1];
        } else {
          return null; // Or handle the case where the ID is not found
        }

    }

    private getGoogleDriveDownloadLink(fileId: string | null): string {
        return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : '';
    }

    private initializeMap(): void {
        
        console.log('IN INITIALZE MAP CONTAINER: ', this.container);
        
        if (!this.container) return;

        this.map = new google.maps.Map(this.container, {
            center: { lat: 0, lng: 0 }, 
            // zoom: this.initialZoom,
            mapId: 'DEMO_MAP_ID'
        } as any);
        
        console.log('MAP: ', this.map);
    }

    private attachMapTypeIdChangeListener(): void {
        this.map?.addListener('maptypeid_changed', () => {
            const currentMapTypeId =this.map?.getMapTypeId();
            if (currentMapTypeId === 'satellite') {
                console.log("User switched to satellite view.");
            } else {
                console.log("User switched from satellite view to: " + currentMapTypeId);
            }
        });
    }

    private addKmlLayer(kmlUrl: string | null): void {
        if (!this.map || !this.kmlUrl) return;

        const kmlLayer = new google.maps.KmlLayer({
            url: this.kmlUrl,
            map: this.map,
            preserveViewport: true,
            suppressInfoWindows: false
        });

        kmlLayer.addListener("status_changed", () => {
            if (kmlLayer.getStatus() !== "OK") {
                console.error("Error loading KML:", kmlLayer.getStatus());
            }
        });

        console.log('z-index of the kml layer: ', kmlLayer.getZIndex());
    }

    private attachAddFeatureEventListener(): void {
        
        if (!this.map) {
            return;
        }

        this.map.data.addListener('addfeature', (event: any) => {
            console.log('Event: ', event);

            const feature = event.feature;
            console.log('event feature: ', feature);
            const geometry = feature.getGeometry();
            console.log('event feature geometry: ', geometry);
            const geometryType = geometry.getType();
            console.log('event feature type: ', geometryType);
            const dateAndTimeText = feature.getProperty('dateAndTime') ? new Date(feature.getProperty('dateAndTime')).toLocaleString() : null ;
            console.log('event dateAndTimeText: ', dateAndTimeText);
      
            if (geometryType === 'Point' && dateAndTimeText) {
                const position = geometry.get();

                const label = document.createElement("div");
                label.textContent = dateAndTimeText; // Set the label text
                label.style.color = "white";
                label.style.backgroundColor = "black";
                label.style.padding = "5px";
                label.style.borderRadius = "5px";
                label.style.fontSize = "12px";
      
                // Create a marker with a label
                new this.AdvancedMarkerElement!({
                    position,
                    map: (this.map as any),
                    content: label
                });
                // console.log('Marker: ', marker);
            }
        });
    }

    private attachClickEventListener(): void {
        if (!this.map) {
            return;
        }

        this.map.data.addListener('click', (event: any) => {
                this.infoWindow.close();

                // console.log('Event: ', event);
                const feature = event.feature;
                const name = feature.getProperty('name');
                const description = feature.getProperty('description');

                const content = `
                <div>
                    <p class="description">${description || ''}</p>                    
                </div>
                `;

                const geometry = event.feature.getGeometry();
                console.log('get geometry: ', geometry);

                const geometryType = geometry.getType();
                console.log('geometryType: ', geometryType);

                const geometryPosition = geometryType === 'Point' ? geometry?.get() : event.latLng;
                console.log('get geomertry get: ', geometryPosition);

                this.infoWindow.setContent(content);
                this.infoWindow.setPosition(geometryPosition);
                this.infoWindow.setOptions({ pixelOffset: new google.maps.Size(0, -20), maxWidth: 265, minWidth: 240 } as any);
                (this.infoWindow as any).setHeaderContent(name);
            
                if (this.map) {
                    console.log('ABOUT TO OPEN INFO WINDOW')
                    this.infoWindow.open(this.map);
                } 
            }
        );
    }

    private async getInitialGeoJSONFromKml(downloadUrl: string, fileName: string): Promise< FeatureCollection<Geometry | null, GeoJsonProperties> | null > {
        
        if(!downloadUrl) {
            return null;
        }

        const fileNameFragments = fileName?.split('.');
        console.log('file name fragments: ', fileNameFragments);
        const fileExtension = fileNameFragments && fileNameFragments[fileNameFragments.length - 1] || '';        
        console.log('file extension: ', fileExtension);
        let extension: string | null = null;

        return fetch(downloadUrl)
            .then(async response => {
                console.log('RESPONSE FROM FETCH CALL: ', response);
                const contentDisposition = response.headers.get('Content-Disposition');
                console.log('Content disposition: ', contentDisposition);
                
                if (contentDisposition) {
                    const filenamePart = contentDisposition.match(/filename="?([^"]+)"?/);
                    console.log('fileNameMatch: ', filenamePart);
                    if (filenamePart && filenamePart[1]) {
                        const filename = filenamePart[1];
                        const lastDotIndex = filename.lastIndexOf('.');

                        if (lastDotIndex !== -1 && lastDotIndex < filename.length - 1) {
                            extension = filename.substring(lastDotIndex + 1);
                            console.log('File Extension From Content Disposition:', extension);
                        }
                    }
                }

                return response.blob();
            })
            .then(blob => blob.text())
            .then(fileText => {
                console.log('FILE TEXT: ', fileText);
                console.log('EXTENSION: ', extension);

                if (fileExtension === 'json' || fileExtension === 'geojson') {
                    return JSON.parse(fileText);
                } else if (fileExtension === 'kml') {
                    console.log('GEOXML 3', geoXML3);
                    const kmlDoc = new DOMParser().parseFromString(fileText, 'text/xml');
                    console.log('fileDOC: ', kmlDoc);
                    const initialGeoJSON = toGeoJSON.kml(kmlDoc);
                    console.log('initial geoJSON: ', initialGeoJSON);
                    const testGeoJSON = kml(kmlDoc);
                    console.log('test geoJSON: ', JSON.stringify(testGeoJSON));
                    return initialGeoJSON;
                } else {
                    console.error(`The file type .${fileExtension} is not supported.`);
                    return null;
                }                            
            })
            .catch(error => {
                console.error("Error downloading or parsing KML:", error);
                return null;
            });
    }

    private addGeoJSONOnMap(geoJSON: FeatureCollection<Geometry | null, GeoJsonProperties> | null): void {
        if (!geoJSON || !this.map) {
            return;
        }

        try {
            this.map.data.addGeoJson(geoJSON);
        } catch (error) {
            console.error("Error adding GeoJSON:", error);
        }
    }

    private displayGeoJSONFromDataSet(): void {
        const features = this.geoJSON?.features;

        if (!features?.length) {
            return;
        }

        features.forEach(feature => {
            const coords = (feature.geometry as Point)?.coordinates;
            const latLng = new google.maps.LatLng(coords[1], coords[0]);

            const dateAndTimeText = feature.properties?.['dateAndTime'] ? new Date(feature.properties?.['dateAndTime']).toLocaleString() : null ;
            const dateAndTimeFragments = dateAndTimeText?.split(',');
            const date = dateAndTimeFragments?.[0] || '';
            const time = (dateAndTimeFragments?.[1])?.trim() || '';
            const name = feature.properties?.['name'];
            const description = feature.properties?.['description'];
            const category = feature.properties?.['category'];

            const infoWindowContent = `
            <div>
                <p>${dateAndTimeText || ''}</p>
                <h4 class="category">${category || ''}</h4>
                <p class="description">${description || ''}</p>                
            </div>`;

            const dateAndTimeTag = document.createElement('div');
            dateAndTimeTag.className = 'date-and-time-tag';
            dateAndTimeTag.innerHTML = `<p>${date || ''}</p><p>${time || ''}</p>`;

            // const marker = new MarkerWithLabel({
            //     position: latLng,
            //     clickable: true,
            //     map: this.map,
            //     labelContent: dateAndTimeTag, // can also be HTMLElement
            //     labelAnchor: new google.maps.Point(18, -30),
            //     labelClass: 'date-and-time-tag'
            // });

            const markerContainer = document.createElement('div');
            markerContainer.style.position = 'relative';

            const pinElement = document.createElement('div');
            pinElement.className = 'marker-pin';

            const labelElement = document.createElement('div');
            labelElement.className = 'marker-label';
            labelElement.setAttribute('title', name);
            labelElement.innerHTML = `<p>${date || ''}</p><p>${time || ''}</p>`;

            markerContainer.appendChild(pinElement);
            markerContainer.appendChild(labelElement);

            const marker = new this.AdvancedMarkerElement!({
                position: latLng,
                map: this.map,
                content: markerContainer,
                gmpClickable: true,
            });

            this.markers.push(marker);
            // if (dateAndTimeText) {
            //     marker.content = dateAndTimeTag;
            // }
            
            const markerClickListener = marker.addListener('click', (event: any) => {
                this.infoWindow.close();
                console.log('closed the info window!');
                this.infoWindow.setContent(infoWindowContent);
                this.infoWindow.setPosition(latLng);
                this.infoWindow.setOptions({ pixelOffset: new google.maps.Size(0, -20), maxWidth: 265, minWidth: 240 } as any);
                (this.infoWindow as any).setHeaderContent(name);
                this.infoWindow.open(this.map);
            });

            this.eventListeners.push(markerClickListener);
        })      
    }

    public async updateView(context: ComponentFramework.Context<IInputs>): Promise<void> {

        console.log('CONTEXT in update view: ', context);

        if (this.initPromise) {
            try {
                await this.initPromise; // Wait for init to complete
                console.log("init finished, updateView can continue");

                this.geoJSON = this.getGeoJsonFromDataset(context.parameters.locationDataSet);
                console.log('This GEOJSON: ', this.geoJSON);
                    
                if (!this.initialGeoJSON) {
                    this.applyCenterAndZoomBoundsOnMap(this.geoJSON);
                }

                this.displayGeoJSONFromDataSet();
            } catch (error) {
                console.error("Error waiting for init:", error);
            }
        } else {
            console.log("init was not called yet");
        }



        // this.getLocationData(this.context.parameters.locationDataSet).then(() => {
        //     console.log('This GEOJSON: ', this.geoJSON);

        //     // this.initializeMap();

        //     // this.attachClickEventListener();

        //     // this.addGeoJSONOnMap(this.initialGeoJSON);
        //     // const centerAndZoomBounds = this.initialGeoJSON ? getCenterAndZoomGeoJsonBounds(this.initialGeoJSON) : 
        //     //     this.geoJSON ? getCenterAndZoomGeoJsonBounds(this.geoJSON) : null;
            
        //     if (!this.initialGeoJSON) {
        //         this.applyCenterAndZoomBoundsOnMap(this.geoJSON);
        //     }

        //     // this.map?.data.setStyle(geoJSONStyleHelper.setStylesByFeatureType);

        //     this.applyCenterAndZoomBoundsOnMap(this.geoJSON);

        //     this.displayGeoJSONFromDataSet();
        //     console.log('adding listener in updateView');

        //     return true;
        // }).catch(error => {
        //     console.error("Error loading initial location data:", error);
        //     throw error;
        // });  
    }

    private applyCenterAndZoomBoundsOnMap(geoJSON: FeatureCollection<Geometry | null, GeoJsonProperties> | null ): void {
        if (!geoJSON) {
            return;
        }

        const centerAndZoomBounds = getCenterAndZoomGeoJsonBounds(geoJSON);
        
        if (centerAndZoomBounds) {
            console.log('About to fit map bounds ', centerAndZoomBounds.toJSON());
            this.map?.fitBounds(centerAndZoomBounds, 0);
            console.log('Map bounds after fitting bounds: ', this.map?.getBounds()?.toJSON());
        }
    }


    public getOutputs(): IOutputs {
        return {};
    }


    public destroy(): void {
        this.eventListeners.forEach(listener => {
            google.maps.event.removeListener(listener);
        });
        this.eventListeners = []; // Clear the array

        // Remove all markers
        this.markers.forEach(marker => {
            marker.map = null; // Detach the marker from the map
        });
        this.markers = []; // Clear the array

        if (this.map) {
            google.maps.event.clearInstanceListeners(this.map);
            this.map.unbindAll();
            const mapContainer = this.map.getDiv();
            if (mapContainer && mapContainer.parentNode) {
                mapContainer.parentNode.removeChild(mapContainer); // Remove the map container from the DOM
            }
            this.map = null;    
        }
        
        if (this.container) {
            this.container.innerHTML = "";
        }
    
        console.log('Component destroyed and resources cleaned up.');
    }
}
