Site Activity Points Component (PCF Component)


Install dependencies:

npm install 

To build component after code has been modified:

npm run build

To start the test harness in the browser:

npm start watch

To make a .zip file with the packaged component: 

mkdir Solutions
cd Solutions

pac solution init --publisher-name fieldontracksolutionpublisher --publisher-prefix fot 

pac solution add-reference --path ..\..\

dotnet build

These commands produce a Solutions.zip file located in the Solutions/bin/Debug folder. It can be imported as a new Solution in the PowerApps model-driven app.

Link to the Microsoft documentation on component build and deployment: https://learn.microsoft.com/en-us/power-apps/developer/component-framework/implementing-controls-using-typescript?tabs=before.


The Site Activity Points Component (PCF Component) features the following:

It uses the Google Maps Javascript Api to load a map with the initial location features of an entity (for example a Site)
It displays on the same map activity points, which are related to this entity.

The component enables the user to visualize where the activity points are in relation to the initial location and make further analysis (are the points within an acceptable range, how fast is the work progressing along the track, etc.).

The component can be attached to a Dataverse table named SiteActivityPoints in Powerapps featuring the following columns:
- Latitude - required
- Longitude - required
- Name - required
- Description - optional
- Date - optional (date and time)
- ImageUrl - optional
- Site (or another entity which should contain a file with the main track) - lookup to Site
- SiteActivityPoints category - lookup to SiteActivityPointsCategory table

The File with the initial track should be uploaded in a File Column of the Site table. It should be a .kml/.geojson/.json file
When the component is rendered in the context of a Site, it should take the Site id from the component's context and get access to the Site Design File column to fetch the file with the initial track. 

If the initial track is a .kml file, the component should convert it to geojson using an external library.

The geojson styling features should be applied: 
- icon of Point features (if the icon url provided in the geojson cannot be loaded, a default icon url should be displayed - the default red pin of Google Maps: 	https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi3.png )
- stroke color, width and opacity for Line String features
- stroke color, width, opacity, fill color and fill opacity for Polygon features

If a geojson feature has a name/description, they should be displayed in an info window upon click on the feature on the map

The points from the SiteActivityPoints table should be transformed into another geojson in the component. This geojson should contain Point features. The points should represent information from checklist reports (from loction fields or media location metadata)

The points should be marked with the default marker mentioned above and upon click should display an info window containing the following:
- title (the name column of the table)
- date and time
- category
- description

Next to the point a small label can be displayed, which should be configured through a parameter passed to the component. The label can display the point's name/description/category/date and time. The labels are always visible on the map and should be readable both in the default Map view and in Satellite view
- if the label contains a longer text, it should be wrapped on two lines with ellipsis and on hover a tooltip should show the full text

When the map is initially loaded, if there are points related to the Site, the initial zoom and centering should display the points with as much zoom as possible, so that all points are visible. If there are no points, the initial zoom and centering should display the full borders of the initial track. If there is no initial track too, the map should be centered and zoomed to coordinates lat: 0 and lng: 0. 
  