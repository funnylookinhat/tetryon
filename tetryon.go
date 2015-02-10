package main

import (
	"flag"
	"gopkg.in/mgo.v2"
	"gopkg.in/mgo.v2/bson"
	"log"
	"net/http"
	//"runtime"
	"sync"
	"time"
)

type DBStats struct {
	Collections int     `bson:"collections"`
	Objects     int     `bson:"objects"`
	AvgObjSize  float64 `bson:"avgObjSize"`
	DataSize    float64 `bson:"dataSize"`
	StorageSize float64 `bson:"storageSize"`
	FileSize    float64 `bson:"fileSize"`
	IndexSize   float64 `bson:"indexSize"`
}

const configFile = "config.json"

const paramsTypeKey = "_ttynREQUESTTYPE"

const databaseLogIntervalSeconds = 60
const requestsLogIntervalSeconds = 10

func main() {
	var err error
	var responseGifData []byte
	var tetryonConfig *TetryonConfig
	var mongoSession *mgo.Session
	var httpServeMux *http.ServeMux
	var requestParamChannel chan map[string]string
	var requestReceivedChannel chan request
	var requestsHandled int64 = 0
	var mutex = &sync.Mutex{}

	log.SetPrefix("Tetryon ")

	var configPath string
	flag.StringVar(&configPath, "configpath", "./config", "Path to configuration.")
	flag.Parse()

	if responseGifData, err = loadResponseGif(transparent1x1Gif); err != nil {
		log.Fatal(err)
	}

	if tetryonConfig, err = loadTetryonConfig(configPath); err != nil {
		log.Fatal(err)
	}

	if mongoSession, err = loadMongoSession(tetryonConfig.MongoConfig); err != nil {
		log.Fatal(err)
	}

	if err = setupParticlesCollection(mongoSession, tetryonConfig); err != nil {
		log.Fatal(err)
	}

	if err = setupBeamsCollection(mongoSession, tetryonConfig); err != nil {
		log.Fatal(err)
	}

	if requestReceivedChannel, err = loadRequestReceivedChannel(mongoSession, tetryonConfig); err != nil {
		log.Fatal(err)
	}

	if requestParamChannel, err = loadParamChannel(requestReceivedChannel); err != nil {
		log.Fatal(err)
	}

	// for i := 0; i < 10; i++ {
	go func() {
		for receivedRequest := range requestReceivedChannel {
			requestsHandled++
			handleReceivedRequest(receivedRequest, mongoSession, tetryonConfig)
		}
	}()
	// }

	activeRequests := make(map[string]*request)

	// for j := 0; j < 10; j++ {
	go func() {
		for parameters := range requestParamChannel {
			handleRequestParameters(parameters, activeRequests, requestReceivedChannel, mutex)
		}
	}()
	// }

	httpServeMux = http.NewServeMux()
	httpServeMux.HandleFunc("/beam", handleBeamRequest(responseGifData, requestParamChannel))
	httpServeMux.HandleFunc("/particle", handleParticleRequest(responseGifData, requestParamChannel))
	httpServeMux.HandleFunc("/", http.NotFound)

	go func() {
		if err := http.ListenAndServeTLS(
			":"+tetryonConfig.HttpsConfig.Port,
			tetryonConfig.HttpsConfig.Cert,
			tetryonConfig.HttpsConfig.Key,
			httpServeMux); err != nil {
			log.Fatal(err)
		}
	}()

	go func() {
		if err := http.ListenAndServe(
			":"+tetryonConfig.HttpConfig.Port,
			httpServeMux); err != nil {
			log.Fatal(err)
		}
	}()

	go func() {
		logDatabaseStats(mongoSession)
		for _ = range time.Tick(databaseLogIntervalSeconds * time.Second) {
			logDatabaseStats(mongoSession)
		}
	}()

	go func() {
		logRequestsHandled(requestsHandled)
		for _ = range time.Tick(requestsLogIntervalSeconds * time.Second) {
			logRequestsHandled(requestsHandled)
		}
	}()

	// Wait Forever
	select {}
}

func loadMongoSession(mongoConfig MongoConfig) (*mgo.Session, error) {
	session, err := mgo.DialWithInfo(&mgo.DialInfo{
		Addrs:    []string{mongoConfig.Hostname},
		Timeout:  60 * time.Second,
		Database: mongoConfig.Database,
		Username: mongoConfig.Username,
		Password: mongoConfig.Password,
	})
	if err != nil {
		return nil, err
	}

	// See: http://godoc.org/labix.org/v2/mgo#Session.SetMode
	// Eventual = efficient but doesn't preserve order well...
	session.SetMode(mgo.Eventual, true)
	session.SetSafe(&mgo.Safe{})

	return session, nil
}

func logDatabaseStats(session *mgo.Session) {
	sessionCopy := session.Copy()
	defer sessionCopy.Close()

	db := sessionCopy.DB("tetryon")

	var dbStats DBStats
	if err := db.Run(bson.D{{"dbStats", 1}, {"scale", 1}}, &dbStats); err != nil {
		log.Println(err)
	}

	log.Printf("Database Size: %0.2f MiB , Collections: %0.2f MiB , Indexes: %0.2f MiB \n", dbStats.StorageSize/1048576, dbStats.DataSize/1048576, dbStats.IndexSize/1048576)
}

func logRequestsHandled(requests int64) {
	log.Printf("Total requests: %d", requests)
	// log.Printf("Total requests: %d Requests per second: %0.2f", requests, math.Floor(float64(requests/seconds)))
}
